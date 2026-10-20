# Issues, discovery, editing, bulk actions and saved searches

Atomic current issue behaviors; web-only composition is distinguished from shared typed services. Watch/unwatch belongs to notifications.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `form`: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61)
- `create`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528)
- `creationRules`: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85)
- `contracts`: [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7)
- `list`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24)
- `liveSearch`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366)
- `parentFilter`: [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:150](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L150)
- `detail`: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18)
- `inline`: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1)
- `fieldSave`: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525)
- `dates`: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321)
- `cas`: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45)
- `actions`: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41)
- `clone`: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:379](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L379)
- `status`: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1)
- `statusKeys`: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:155](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L155)
- `bulk`: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41)
- `selection`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434)
- `saved`: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28)
- `savedRules`: [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298)
- `savedOverlay`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487)
- `updateRules`: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34)
- `moveRules`: [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36)
- `keyboardPopup`: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:373](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L373)
- `organization`: [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50)
- `mcp`: [backend/internal/features/issues/canonical_mcp.go:25](../../../backend/internal/features/issues/canonical_mcp.go#L25)
- `organizationMcp`: [backend/internal/features/issues/organization_mcp.go:9](../../../backend/internal/features/issues/organization_mcp.go#L9)
- `history`: [frontend/src/app/features/issues/components/issue-history/issue-history.component.ts:1](../../../frontend/src/app/features/issues/components/issue-history/issue-history.component.ts#L1)
- `gap_gap_iss_002`: [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:172](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L172)
- `creationUploadOwner`: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:712](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L712)
- `creationEpoch`: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:186](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L186)
- `boardCreationEpoch`: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:126](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L126)
- `authorizationEpoch`: [frontend/src/app/core/auth/auth.service.ts:44](../../../frontend/src/app/core/auth/auth.service.ts#L44)
- `sessionDraftReset`: [frontend/src/app/core/drafts/drafts.service.ts:81](../../../frontend/src/app/core/drafts/drafts.service.ts#L81)
- `initialUploadPermission`: [backend/internal/features/attachments/resumable.go:147](../../../backend/internal/features/attachments/resumable.go#L147)
- `boardCreationReplyOwner`: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:420](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L420)

## Cases

<a id="uc-iss-0001"></a>
### UC-ISS-0001 — Open issue creation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A writable active project is selected.

**Steps**

1. Choose New issue.

**Expected results**

- A modal opens with title focused.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts).

<a id="uc-iss-0002"></a>
### UC-ISS-0002 — Reuse global Create command

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Invoke global Create after previously closing creation.

**Expected results**

- The current project create dialog opens again.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

Related test files: [jira-audit-findings.spec.ts](../../../frontend/e2e/jira-audit-findings.spec.ts).

<a id="uc-iss-0003"></a>
### UC-ISS-0003 — Create issue with title only

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a valid title.

**Expected results**

- One issue receives its project number/key and opens in detail.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0004"></a>
### UC-ISS-0004 — Use default type

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create without a type override.

**Expected results**

- The current standard-type project default is saved.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0005"></a>
### UC-ISS-0005 — Choose custom type

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create with an active custom type.

**Expected results**

- The exact selected type identity/name is retained.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0006"></a>
### UC-ISS-0006 — Use default priority

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create without a priority override.

**Expected results**

- The current project default priority is saved.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0007"></a>
### UC-ISS-0007 — Choose custom priority

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create with an active custom priority.

**Expected results**

- The exact selected priority identity/name is retained.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0008"></a>
### UC-ISS-0008 — Use default workflow

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create without a workflow override.

**Expected results**

- The selected type default workflow binding is used.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0009"></a>
### UC-ISS-0009 — Choose alternative workflow

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select an accepting workflow before creating.

**Expected results**

- Issue starts in that workflow initial To do stage.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0010"></a>
### UC-ISS-0010 — Refresh workflow bindings for type

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change type in the create form.

**Expected results**

- Available accepting workflow choices update for that type.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts).

Related cases: [UC-ISS-0008](../features/issues.md#uc-iss-0008), [UC-ISS-0009](../features/issues.md#uc-iss-0009).

Note: Surface correction: Refreshing creation workflow choices after type changes is native form state. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0011"></a>
### UC-ISS-0011 — Create assigned issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose an eligible assignee and create.

**Expected results**

- The new issue displays that assignee.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0012"></a>
### UC-ISS-0012 — Create unassigned issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create without an assignee.

**Expected results**

- The new issue is unassigned.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0013"></a>
### UC-ISS-0013 — Create with due date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose a due date and create.

**Expected results**

- The calendar date is retained.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0014"></a>
### UC-ISS-0014 — Create with labels

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select project labels and create.

**Expected results**

- The label selection is retained.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0015"></a>
### UC-ISS-0015 — Create directly in backlog

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create from the issue backlog view.

**Expected results**

- The new issue is marked backlog and excluded from active-board work.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0016"></a>
### UC-ISS-0016 — Cancel clean creation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel the untouched create form.

**Expected results**

- Dialog closes without an issue.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

<a id="uc-iss-0017"></a>
### UC-ISS-0017 — Protect dirty creation

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel a create form containing unsaved work.

**Expected results**

- A discard confirmation protects the draft.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

<a id="uc-iss-0018"></a>
### UC-ISS-0018 — Restore create draft

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen a retained same-tab create draft.

**Expected results**

- Draft fields and queued files return.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61).

Related test files: [daily-ux-completion.spec.ts](../../../frontend/e2e/daily-ux-completion.spec.ts).

<a id="uc-iss-0019"></a>
### UC-ISS-0019 — Queue files before creating

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose attachments before an issue exists.

**Expected results**

- Queued files wait for creation rather than uploading to a nonexistent issue.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61).

Related test files: [daily-ux-completion.spec.ts](../../../frontend/e2e/daily-ux-completion.spec.ts).

<a id="uc-iss-0020"></a>
### UC-ISS-0020 — Finish creation uploads

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create an issue with queued attachments.

**Expected results**

- Uploads finish on the created issue before final navigation.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

Shared business operations: `create_issue_v2`.

Related test files: [daily-ux-completion.spec.ts](../../../frontend/e2e/daily-ux-completion.spec.ts).

Related cases: [UC-AST-0060](../features/assets.md#uc-ast-0060), [UC-AST-0064](../features/assets.md#uc-ast-0064).

Note: Surface correction: Finishing the local upload queue before final navigation is multi-step native orchestration. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0021"></a>
### UC-ISS-0021 — Recover post-create upload failure

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry creation after the issue exists but one upload failed.

**Expected results**

- The same created issue is reused while remaining uploads finish.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528).

Shared business operations: `create_issue_v2`.

Related test files: [daily-ux-completion.spec.ts](../../../frontend/e2e/daily-ux-completion.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0022](../features/issues.md#uc-iss-0022), [UC-AST-0064](../features/assets.md#uc-ast-0064).

Note: Surface correction: The created-issue/upload queue recovery receipt is local orchestration, not one create tool call. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0022"></a>
### UC-ISS-0022 — Replay uncertain create

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry an accepted create whose acknowledgment was lost.

**Expected results**

- Original retry reference returns the original issue once.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:528](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L528), [backend/internal/features/issues/canonical_mcp.go:25](../../../backend/internal/features/issues/canonical_mcp.go#L25).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0023"></a>
### UC-ISS-0023 — Preserve accepted creation defaults on replay

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Replay an accepted create after project defaults changed.

**Expected results**

- Originally accepted type/priority/workflow remain unchanged.

Sources: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85), [backend/internal/features/issues/canonical_mcp.go:25](../../../backend/internal/features/issues/canonical_mcp.go#L25).

Shared business operations: `create_issue_v2`.

Related test files: [modern-issues.spec.ts](../../../frontend/e2e/modern-issues.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0024"></a>
### UC-ISS-0024 — Reject empty title

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit an empty or whitespace-only title.

**Expected results**

- Creation is rejected without a new issue.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0025"></a>
### UC-ISS-0025 — Reject overlong title

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a title longer than 200 Unicode characters.

**Expected results**

- A validation error preserves the draft.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0188](../features/issues.md#uc-iss-0188).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0026"></a>
### UC-ISS-0026 — Reject retired creation type

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a retired type for a new issue.

**Expected results**

- Creation is rejected.

Sources: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0027"></a>
### UC-ISS-0027 — Reject retired creation priority

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a retired priority for a new issue.

**Expected results**

- Creation is rejected.

Sources: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0028"></a>
### UC-ISS-0028 — Reject inactive workflow binding

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create using a type/workflow binding that no longer accepts new issues.

**Expected results**

- Creation is rejected under current rules.

Sources: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0029"></a>
### UC-ISS-0029 — Restrict explicit creation stage

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Supply a stage other than the initial To do stage.

**Expected results**

- Creation is rejected; later progress must use a move.

Sources: [backend/internal/features/issues/canonical_choices.go:85](../../../backend/internal/features/issues/canonical_choices.go#L85).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0030"></a>
### UC-ISS-0030 — Set import source identity

Actor: `writer` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create with a valid importSourceKey.

**Expected results**

- The stable source identity is recorded without a native create-form control.

Sources: [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0031"></a>
### UC-ISS-0031 — Read issue search results

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open Issues.

**Expected results**

- Authorized active issues, total matching count and shown count load.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0032"></a>
### UC-ISS-0032 — Live title search

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type a title fragment.

**Expected results**

- Results update without a search-button click.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0189](../features/issues.md#uc-iss-0189).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0033"></a>
### UC-ISS-0033 — Live key search

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type a full issue key.

**Expected results**

- The matching authorized issue appears.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0034"></a>
### UC-ISS-0034 — Live numeric search

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type a bare issue number.

**Expected results**

- Numeric results respect the active project scope.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0035"></a>
### UC-ISS-0035 — Clear search text

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Clear the query.

**Expected results**

- Unqueried results return with other filters retained.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0036"></a>
### UC-ISS-0036 — Filter one project

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select a project.

**Expected results**

- Results and project-specific choices use that project.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0037"></a>
### UC-ISS-0037 — Search accessible projects

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select All accessible projects.

**Expected results**

- Only authorized cross-project results appear.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0038"></a>
### UC-ISS-0038 — Filter open issues

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Open issues.

**Expected results**

- Unfinished categories remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0039"></a>
### UC-ISS-0039 — Filter To do

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select To do.

**Expected results**

- Only the selected status category remains.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0040"></a>
### UC-ISS-0040 — Filter In progress

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select In progress.

**Expected results**

- Only the selected status category remains.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0041"></a>
### UC-ISS-0041 — Filter Review

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Review.

**Expected results**

- Only the selected status category remains.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0042"></a>
### UC-ISS-0042 — Filter Done

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Done.

**Expected results**

- Only the selected status category remains.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0043"></a>
### UC-ISS-0043 — Filter assigned to me

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Me.

**Expected results**

- Only self-assigned results remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0044"></a>
### UC-ISS-0044 — Use My Issues shortcut

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click My Issues.

**Expected results**

- The assignee filter changes to self and results refresh.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0043](../features/issues.md#uc-iss-0043).

Note: Surface correction: My Issues changes the native filter controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0045"></a>
### UC-ISS-0045 — Filter unassigned

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Unassigned.

**Expected results**

- Only issues without assignee remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0046"></a>
### UC-ISS-0046 — Find filter teammate

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type in Find teammate.

**Expected results**

- Matching project teammates appear automatically.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0197](../features/issues.md#uc-iss-0197).

Note: Surface correction: Automatically updating teammate candidates while typing is native picker behavior. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0047"></a>
### UC-ISS-0047 — Filter selected teammate

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose a teammate.

**Expected results**

- Results use that assignee.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0048"></a>
### UC-ISS-0048 — Filter custom type

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose a type.

**Expected results**

- Results match that type identity.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0049"></a>
### UC-ISS-0049 — Filter custom priority

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose a priority.

**Expected results**

- Results match that priority identity.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0050"></a>
### UC-ISS-0050 — Filter due lower bound

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Set Due from.

**Expected results**

- Earlier due dates are excluded.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0051"></a>
### UC-ISS-0051 — Filter due upper bound

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Set Due through.

**Expected results**

- Later due dates are excluded.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0052"></a>
### UC-ISS-0052 — Filter overdue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Overdue.

**Expected results**

- Company-calendar overdue issues remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0053"></a>
### UC-ISS-0053 — Filter not overdue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Not overdue.

**Expected results**

- Results match the non-overdue filter.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0054"></a>
### UC-ISS-0054 — Filter blocked work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Blocked.

**Expected results**

- Only issues with unfinished direct blockers remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0055"></a>
### UC-ISS-0055 — Filter unblocked work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Unblocked.

**Expected results**

- Only issues without unfinished direct blockers remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0056"></a>
### UC-ISS-0056 — Filter all selected labels

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select multiple labels.

**Expected results**

- Only issues carrying every selected label remain.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0057"></a>
### UC-ISS-0057 — Search parent filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type parent number, key or title.

**Expected results**

- Matching standard-behavior parent choices appear.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366), [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:150](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L150).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Gaps: [GAP-ISS-001](../gaps.md#gap-iss-001), [GAP-ISS-002](../gaps.md#gap-iss-002).

<a id="uc-iss-0058"></a>
### UC-ISS-0058 — Select parent filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select a parent.

**Expected results**

- Results become that parent subtasks.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366), [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:150](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L150).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0059"></a>
### UC-ISS-0059 — Clear parent filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click Clear parent filter.

**Expected results**

- Other issue filters remain without the parent constraint.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366), [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:150](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L150).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0058](../features/issues.md#uc-iss-0058).

Note: Surface correction: Clearing only the native parent filter retains other client controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0060"></a>
### UC-ISS-0060 — View active work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Active work.

**Expected results**

- Active unarchived work is shown.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0061"></a>
### UC-ISS-0061 — View backlog

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Backlog.

**Expected results**

- Backlog issues are shown.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0062"></a>
### UC-ISS-0062 — View archived work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Archived issues.

**Expected results**

- Archived issues are shown.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0063"></a>
### UC-ISS-0063 — Sort recently updated

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Recently updated.

**Expected results**

- Results use updated ordering.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0064"></a>
### UC-ISS-0064 — Sort newest created

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Newest created.

**Expected results**

- Results use creation ordering.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0065"></a>
### UC-ISS-0065 — Sort earliest due

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Earliest due.

**Expected results**

- Results use due-date ordering.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0066"></a>
### UC-ISS-0066 — Sort highest priority

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Highest priority.

**Expected results**

- Results use configured priority ordering without floating-point coercion.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0067"></a>
### UC-ISS-0067 — Combine issue filters

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Set multiple independent filters.

**Expected results**

- Their intersection applies automatically.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0068"></a>
### UC-ISS-0068 — Reset issue filters

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click Reset filters.

**Expected results**

- Query and advanced/saved filter overlays clear.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

Related cases: [UC-ISS-0031](../features/issues.md#uc-iss-0031).

Note: Surface correction: Reset removes local query/advanced/saved overlays, not server records. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0069"></a>
### UC-ISS-0069 — Append issue page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click More issues.

**Expected results**

- Next cursor page appends and shown count grows.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0190](../features/issues.md#uc-iss-0190).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0070"></a>
### UC-ISS-0070 — Reset paging after filter change

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Change a filter after loading more.

**Expected results**

- Old cursor is discarded and first-page results replace prior rows.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0190](../features/issues.md#uc-iss-0190).

Note: Surface correction: Resetting a retained cursor after a filter change is native list ownership. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0071"></a>
### UC-ISS-0071 — Show no-match state

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Search a nonmatching term.

**Expected results**

- No-match copy appears after pending lookup completes.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0191](../features/issues.md#uc-iss-0191).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0072"></a>
### UC-ISS-0072 — Initialize route filters

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open an issue-list URL with supported filters.

**Expected results**

- Controls/results match query, project, status, assignee, view, sort, blocked and parent parameters.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0067](../features/issues.md#uc-iss-0067).

Note: Surface correction: Route parameter initialization is a browser-router behavior. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0073"></a>
### UC-ISS-0073 — Follow route changes

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Navigate to a differently filtered URL on the same list route.

**Expected results**

- Current URL filters replace the reused route state.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0067](../features/issues.md#uc-iss-0067).

Note: Surface correction: Reusing a route component after URL changes is a browser-router behavior. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0074"></a>
### UC-ISS-0074 — Page projects choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request more projects.

**Expected results**

- Additional choice page becomes available.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

<a id="uc-iss-0075"></a>
### UC-ISS-0075 — Page types choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request more types.

**Expected results**

- Additional choice page becomes available.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

<a id="uc-iss-0076"></a>
### UC-ISS-0076 — Page priorities choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request more priorities.

**Expected results**

- Additional choice page becomes available.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

<a id="uc-iss-0077"></a>
### UC-ISS-0077 — Page teammates choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request more teammates.

**Expected results**

- Additional choice page becomes available.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

<a id="uc-iss-0078"></a>
### UC-ISS-0078 — Ignore stale issue search

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Let an older query finish after a newer query.

**Expected results**

- Only latest query results update the list.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-ISS-0189](../features/issues.md#uc-iss-0189).

Note: Surface correction: Ignoring an earlier completed search is native request-generation ownership. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0079"></a>
### UC-ISS-0079 — Recover issue search failure

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Cause an issue-search request to fail.

**Expected results**

- An error state is exposed without presenting it as successful new results.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related cases: [UC-ISS-0191](../features/issues.md#uc-iss-0191).

Note: Surface correction: Presenting a recoverable list error rather than replacement rows is native presentation. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0080"></a>
### UC-ISS-0080 — Find Arabic issue title

Actor: `reader` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Search an Arabic or mixed-direction title.

**Expected results**

- Matching text remains intact and readable.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0081"></a>
### UC-ISS-0081 — Open detail from issue row

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Activate an issue result.

**Expected results**

- Correct issue detail loads.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0082"></a>
### UC-ISS-0082 — Open detail from board card

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Activate a board issue card.

**Expected results**

- Embedded detail loads the same issue and capabilities.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0083"></a>
### UC-ISS-0083 — Return to project issues

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Follow All issues breadcrumb.

**Expected results**

- Issue list opens in that project context.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0084"></a>
### UC-ISS-0084 — Open issue project

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Follow Open project.

**Expected results**

- Correct project opens.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0085"></a>
### UC-ISS-0085 — Open project boards

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Follow Kanban boards.

**Expected results**

- Correct project board directory opens.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0086"></a>
### UC-ISS-0086 — Inspect reporter and dates

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Expand Reporter and dates.

**Expected results**

- Reporter and created/updated timestamps are displayed.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0087"></a>
### UC-ISS-0087 — Open comments tab

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select Comments activity tab.

**Expected results**

- Discussion panel is active.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0088"></a>
### UC-ISS-0088 — Open history tab

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Select History activity tab.

**Expected results**

- Issue history loads on demand.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/issue-history/issue-history.component.ts:1](../../../frontend/src/app/features/issues/components/issue-history/issue-history.component.ts#L1).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0089"></a>
### UC-ISS-0089 — Read further issue history

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request the next history page.

**Expected results**

- Further retained events are displayed.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/issue-history/issue-history.component.ts:1](../../../frontend/src/app/features/issues/components/issue-history/issue-history.component.ts#L1).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-iss-0090"></a>
### UC-ISS-0090 — Reload unavailable detail

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Use Reload issue after load error.

**Expected results**

- Issue read is retried with actionable error state.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Shared business operations: `get_issue_v2`.

Related cases: [UC-ISS-0172](../features/issues.md#uc-iss-0172).

Note: Surface correction: A retry action and its actionable error state require native controls. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0091"></a>
### UC-ISS-0091 — Open title editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Click title/edit title.

**Expected results**

- Inline title editor opens.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0092"></a>
### UC-ISS-0092 — Save title

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save an edited valid title.

**Expected results**

- Title persists and detail receives current revision.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0093"></a>
### UC-ISS-0093 — Cancel title edit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel an unsaved title edit.

**Expected results**

- Stored title remains unchanged.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0094"></a>
### UC-ISS-0094 — Open description editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Click editable description.

**Expected results**

- Rich description editor opens.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0095"></a>
### UC-ISS-0095 — Save description

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save edited description.

**Expected results**

- Safe accepted content persists.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0096"></a>
### UC-ISS-0096 — Cancel description edit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel description draft.

**Expected results**

- Stored description remains unchanged.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0097"></a>
### UC-ISS-0097 — Open assignee popup

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Click assignee.

**Expected results**

- Floating teammate picker opens.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0098"></a>
### UC-ISS-0098 — Search assignee live

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type a teammate query.

**Expected results**

- Latest matching eligible choices appear.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Shared business operations: `list_assignees`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

Related cases: [UC-ISS-0197](../features/issues.md#uc-iss-0197).

Note: Surface correction: Displaying only the latest eligible choice response is native picker state. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0099"></a>
### UC-ISS-0099 — Autosave assignee

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose a teammate.

**Expected results**

- Assignee saves immediately without Save.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0100"></a>
### UC-ISS-0100 — Autosave unassignment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Unassigned.

**Expected results**

- Assignee clears immediately.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0101"></a>
### UC-ISS-0101 — Autosave priority

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose an active priority.

**Expected results**

- Priority saves immediately.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0102"></a>
### UC-ISS-0102 — Autosave chosen date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose a native calendar date.

**Expected results**

- Due date saves immediately.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0103"></a>
### UC-ISS-0103 — Commit typed date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type a complete date and press Enter.

**Expected results**

- The completed date saves.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0104"></a>
### UC-ISS-0104 — Commit date on leaving

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Leave a complete typed date input.

**Expected results**

- The completed date saves before closing.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0102](../features/issues.md#uc-iss-0102).

Note: Surface correction: Blur and popup-close ordering only exist in the native date control. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0105"></a>
### UC-ISS-0105 — Keep partial dates local

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type incomplete date segments.

**Expected results**

- Intermediate date/year is not written.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

<a id="uc-iss-0106"></a>
### UC-ISS-0106 — Clear due date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Clear date.

**Expected results**

- Stored due date becomes null.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:321](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L321), [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0107"></a>
### UC-ISS-0107 — Save label edit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change label selection and click Save.

**Expected results**

- Label set persists explicitly.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0108"></a>
### UC-ISS-0108 — Open full editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Edit issue.

**Expected results**

- Complete editable issue form populates.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

<a id="uc-iss-0109"></a>
### UC-ISS-0109 — Save full editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save valid full issue edit.

**Expected results**

- Accepted complete editable values appear.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0110"></a>
### UC-ISS-0110 — Change standard issue type

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose another permitted active standard type and save.

**Expected results**

- Type changes while assigned workflow remains fixed.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0111"></a>
### UC-ISS-0111 — Retain retired choices

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save unrelated changes retaining old retired type/priority.

**Expected results**

- Unchanged retained identities remain accepted.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0112"></a>
### UC-ISS-0112 — Archive issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Archive issue.

**Expected results**

- Issue leaves active work while history remains.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0113"></a>
### UC-ISS-0113 — Restore issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Restore issue.

**Expected results**

- Archived flag clears without changing completion history.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0114"></a>
### UC-ISS-0114 — Move issue to backlog

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Move to backlog on unstarted issue.

**Expected results**

- Issue becomes backlog work.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0115"></a>
### UC-ISS-0115 — Activate backlog issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Add to board.

**Expected results**

- Issue leaves backlog and becomes active board-eligible work.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0116"></a>
### UC-ISS-0116 — Clone ordinary issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Clone issue.

**Expected results**

- A new standard issue opens with Copy of title, editable system fields, and plain-text description.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:379](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L379).

Shared business operations: `create_issue_v2`.

Gaps: [GAP-ISS-003](../gaps.md#gap-iss-003).

Note: Client-side creation composition; there is no clone MCP tool. Custom values, planning links, original workflow, attachments, comments, issue links and subtasks are not copied.

<a id="uc-iss-0117"></a>
### UC-ISS-0117 — Clone rich description

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Clone issue with HTML description.

**Expected results**

- HTML is flattened to plain text in the clone.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:379](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L379).

Shared business operations: `create_issue_v2`.

Gaps: [GAP-ISS-003](../gaps.md#gap-iss-003).

<a id="uc-iss-0118"></a>
### UC-ISS-0118 — Clone subtask as standard work

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Clone a subtask.

**Expected results**

- Parent is not copied; the project default standard type is used.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:379](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L379).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Gaps: [GAP-ISS-003](../gaps.md#gap-iss-003).

<a id="uc-iss-0119"></a>
### UC-ISS-0119 — Open stage menu

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Click current status.

**Expected results**

- Current stage and current-workflow transition targets appear.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

Related cases: [UC-ISS-0198](../features/issues.md#uc-iss-0198).

Note: Surface correction: Opening the status menu and its current selection is a native action. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0120"></a>
### UC-ISS-0120 — Move to allowed stage

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose an allowed target.

**Expected results**

- Stage persists and detail updates.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `move_issue_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0121"></a>
### UC-ISS-0121 — Keep current stage

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose already-saved current stage.

**Expected results**

- No issue mutation is submitted.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0120](../features/issues.md#uc-iss-0120).

Note: Surface correction: Not submitting a mutation is a native choice-control behavior. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0122"></a>
### UC-ISS-0122 — Inspect restricted stage

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Inspect a restricted target.

**Expected results**

- Administrator or approval requirement is explained and selection disabled.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0198](../features/issues.md#uc-iss-0198), [UC-APR-0027](../features/fields-review-labels.md#uc-apr-0027).

Note: Surface correction: Explaining and disabling a menu option requires native controls. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0123"></a>
### UC-ISS-0123 — Page stage targets

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose More stages.

**Expected results**

- Additional current-workflow targets appear.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0124"></a>
### UC-ISS-0124 — Retry stage lookup

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Retry stages after failure.

**Expected results**

- Transition lookup runs again.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0123](../features/issues.md#uc-iss-0123).

Note: Surface correction: Retrying a native failed stage lookup is client orchestration. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0125"></a>
### UC-ISS-0125 — Select bulk issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select one issue checkbox.

**Expected results**

- Issue enters selection and count grows.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0126"></a>
### UC-ISS-0126 — Deselect bulk issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Clear one selected checkbox.

**Expected results**

- Issue leaves selection.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0127"></a>
### UC-ISS-0127 — Select visible issues

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Select visible issues.

**Expected results**

- Visible loaded issues join selection up to 100.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0128"></a>
### UC-ISS-0128 — Deselect visible issues

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Select visible when all visible are selected.

**Expected results**

- Visible issues leave selection.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0129"></a>
### UC-ISS-0129 — Limit bulk selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reach 100 selected issues.

**Expected results**

- Additional selection is disabled.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:434](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L434).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0130"></a>
### UC-ISS-0130 — Bulk priority

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply selected priority to issues.

**Expected results**

- Each eligible issue saves selected active priority independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0131"></a>
### UC-ISS-0131 — Bulk assignment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply selected assignee to issues.

**Expected results**

- Each eligible issue saves selected assignee independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0132"></a>
### UC-ISS-0132 — Bulk unassignment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply Unassigned to issues.

**Expected results**

- Each eligible issue clears assignee independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0133"></a>
### UC-ISS-0133 — Bulk due date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply a due date to issues.

**Expected results**

- Each eligible issue saves date independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0134"></a>
### UC-ISS-0134 — Bulk clear date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply an empty due date.

**Expected results**

- Each eligible issue clears date independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0135"></a>
### UC-ISS-0135 — Bulk stage move

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply target stage to compatible issues.

**Expected results**

- Per-issue workflow, permissions and prerequisites govern each result.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `move_issue_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0136"></a>
### UC-ISS-0136 — Bulk archive

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply Archive.

**Expected results**

- Each eligible issue becomes archived independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `organize_issue`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0137"></a>
### UC-ISS-0137 — Bulk restore

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply Restore.

**Expected results**

- Each eligible issue is restored independently.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `organize_issue`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0138"></a>
### UC-ISS-0138 — Bulk move to backlog

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply Move to backlog.

**Expected results**

- Each eligible unstarted issue moves to backlog.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `organize_issue`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0139"></a>
### UC-ISS-0139 — Bulk add to board

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply Add to board.

**Expected results**

- Each eligible issue becomes active work.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `organize_issue`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0140"></a>
### UC-ISS-0140 — Inspect mixed bulk result

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Finish a bulk action with mixed outcomes.

**Expected results**

- Success/failure report appears and failed items remain selected.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0141"></a>
### UC-ISS-0141 — Review bulk failure

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Review for a definite failed item.

**Expected results**

- Current issue state is available for deliberate retry.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0142"></a>
### UC-ISS-0142 — Clear bulk selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Clear selection.

**Expected results**

- Selection clears when no uncertain action is frozen.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

<a id="uc-iss-0143"></a>
### UC-ISS-0143 — Reset stale bulk targets

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Switch project or workflow selection.

**Expected results**

- Old stage/priority targets clear before Apply.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Related test files: [code-quality-regressions.spec.ts](../../../frontend/e2e/code-quality-regressions.spec.ts).

<a id="uc-iss-0144"></a>
### UC-ISS-0144 — Save new private search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Save current filters as a new named search.

**Expected results**

- Private saved search is added.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0145"></a>
### UC-ISS-0145 — Apply private search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Choose an existing saved search.

**Expected results**

- Its complete stored filters apply.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `list_saved_searches`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0149](../features/issues.md#uc-iss-0149).

Note: Surface correction: Applying a saved filter set to current native controls is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0146"></a>
### UC-ISS-0146 — Update private search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Choose Update saved search.

**Expected results**

- Current complete filters replace stored filters.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0147"></a>
### UC-ISS-0147 — Rename private search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Choose Rename saved search with new name.

**Expected results**

- Name changes while stored filters are retained.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0148"></a>
### UC-ISS-0148 — Remove private search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Choose Remove saved search.

**Expected results**

- Search disappears from caller list.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0149"></a>
### UC-ISS-0149 — Preserve multi-value search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Apply a saved search containing multiple values.

**Expected results**

- All saved values remain active even when visible controls are single-select.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `list_saved_searches`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0192](../features/issues.md#uc-iss-0192).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0150"></a>
### UC-ISS-0150 — Edit one saved-filter dimension

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Change one control after applying complete saved filter.

**Expected results**

- Only that filter dimension changes.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-iss-0151"></a>
### UC-ISS-0151 — Restore saved-search draft

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Return to same-tab saved-search draft.

**Expected results**

- Draft name and pending request remain.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0144](../features/issues.md#uc-iss-0144).

Note: Surface correction: A same-tab saved-search draft/pending request is client memory. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0152"></a>
### UC-ISS-0152 — Reject empty saved name

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Save a whitespace-only search name.

**Expected results**

- Validation rejects and preserves draft.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0153"></a>
### UC-ISS-0153 — Reject overlong saved name

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Save more than 80 characters in search name.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0200](../features/issues.md#uc-iss-0200).

Note: Surface correction: The native saved-search name input has maxlength 80 and cannot submit an overlong name by ordinary typing. The original greater-than-80 raw request rejection remains required on REST/MCP.

<a id="uc-iss-0154"></a>
### UC-ISS-0154 — Reject duplicate saved name

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Save a conflicting private name.

**Expected results**

- Validation rejects without replacing another search.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0155"></a>
### UC-ISS-0155 — Limit private searches

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Create a 51st active private search.

**Expected results**

- Validation requires removing an existing search.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0156"></a>
### UC-ISS-0156 — Protect private searches

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Request another user private saved search.

**Expected results**

- No private filters or name are exposed.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298).

Shared business operations: `list_saved_searches`, `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0157"></a>
### UC-ISS-0157 — Merge unrelated autosave edits

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Autosave one field while a teammate changed a different field.

**Expected results**

- Selected-field prior-value comparison merges without losing teammate data.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0158"></a>
### UC-ISS-0158 — Review same-field conflict

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Autosave a field changed concurrently by another writer.

**Expected results**

- Conflict retains draft and requires explicit current-state review.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts).

Related cases: [UC-ISS-0193](../features/issues.md#uc-iss-0193).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0159"></a>
### UC-ISS-0159 — Replay accepted autosave

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry after accepted autosave acknowledgment is lost.

**Expected results**

- Original payload/reference replays once without another revision.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0160"></a>
### UC-ISS-0160 — Lock pending autosave

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose again while autosave response is pending.

**Expected results**

- Selection remains locked to the original request.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts).

Related cases: [UC-ISS-0159](../features/issues.md#uc-iss-0159).

Note: Surface correction: Freezing a native selection to an in-flight intent is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0161"></a>
### UC-ISS-0161 — Avoid no-op field write

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose the already-saved field value.

**Expected results**

- No duplicate accepted revision/event is created.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [issue-field-autosave.spec.ts](../../../frontend/e2e/issue-field-autosave.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-iss-0162"></a>
### UC-ISS-0162 — Review full-edit conflict

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save full issue form against stale revision.

**Expected results**

- Latest issue is offered for review and form draft remains.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0194](../features/issues.md#uc-iss-0194).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0163"></a>
### UC-ISS-0163 — Restore inline draft

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Return to an unsaved same-tab field draft.

**Expected results**

- Draft restores with original revision for conflict checking.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0157](../features/issues.md#uc-iss-0157).

Note: Surface correction: Inline same-tab draft restoration is client memory. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0164"></a>
### UC-ISS-0164 — Freeze uncertain bulk

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Encounter uncertain item results in a bulk action.

**Expected results**

- Original values/references remain and filters/actions/selection freeze.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0130](../features/issues.md#uc-iss-0130).

Note: Surface correction: Bulk filters/actions/selection freezing is native orchestration. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0165"></a>
### UC-ISS-0165 — Retry uncertain bulk

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry original bulk action.

**Expected results**

- Accepted items replay without duplicate changes; unresolved items remain.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:41](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L41).

Shared business operations: `patch_issue_field_v2`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0159](../features/issues.md#uc-iss-0159).

Note: Surface correction: Aggregate unresolved-item retry state belongs to the native bulk editor. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0166"></a>
### UC-ISS-0166 — Freeze uncertain saved search

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Lose acknowledgment of accepted saved-search change.

**Expected results**

- Original name, filters and reference stay pending.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0144](../features/issues.md#uc-iss-0144), [UC-ISS-0195](../features/issues.md#uc-iss-0195).

Note: Surface correction: Freezing an unsent name/filter draft with an uncertain retry intention is client memory. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0167"></a>
### UC-ISS-0167 — Review saved-search conflict

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Review after saved search changed elsewhere.

**Expected results**

- Latest searches load while current draft remains.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0195](../features/issues.md#uc-iss-0195).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0168"></a>
### UC-ISS-0168 — Clear old saved-search success

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Start a new saved-search write after previous success.

**Expected results**

- Previous success message clears while next write is pending.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28).

Shared business operations: `save_issue_search`.

Related test files: [modern-client-completion.spec.ts](../../../frontend/e2e/modern-client-completion.spec.ts).

Related cases: [UC-ISS-0146](../features/issues.md#uc-iss-0146).

Note: Surface correction: Clearing the previous success message during a later pending write is client presentation. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-iss-0169"></a>
### UC-ISS-0169 — Protect viewer edits

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open issue as viewer.

**Expected results**

- Readable fields remain; create/edit/move/bulk mutations are unavailable.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24).

<a id="uc-iss-0170"></a>
### UC-ISS-0170 — Reject revoked writer

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save after write access is revoked.

**Expected results**

- Current permission rejects save; draft remains.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0196](../features/issues.md#uc-iss-0196).

Note: Surface correction: The native copy/draft/display behavior is separate from the accepted/rejected service outcome. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-iss-0171"></a>
### UC-ISS-0171 — Reject archived project writes

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save after project is archived.

**Expected results**

- Current project state rejects mutation.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0172"></a>
### UC-ISS-0172 — Hide unauthorized issue

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read inaccessible issue directly.

**Expected results**

- No protected issue content is exposed.

Sources: [backend/internal/features/issues/canonical_mcp.go:25](../../../backend/internal/features/issues/canonical_mcp.go#L25).

Shared business operations: `get_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0173"></a>
### UC-ISS-0173 — Validate current assignee

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save an ineligible or inactive assignee.

**Expected results**

- Assignment is rejected.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45).

Shared business operations: `patch_issue_field_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0174"></a>
### UC-ISS-0174 — Reject behavior-changing type

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change standard/subtask behavior through ordinary edit.

**Expected results**

- Parent relationship and behavior cannot be reassigned.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-ISS-0199](../features/issues.md#uc-iss-0199).

Note: Surface correction: The type selector filters by the current immutable standard/subtask behavior. It cannot submit a behavior-changing type through a native choice; arbitrary discriminator identifiers are typed REST/MCP request validation. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-iss-0175"></a>
### UC-ISS-0175 — Reject incompatible type workflow

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Assign type not accepted in existing workflow.

**Expected results**

- Update rejects incompatible type.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0176"></a>
### UC-ISS-0176 — Reject retired new priority

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change to retired priority.

**Expected results**

- Update rejects new retired assignment.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

<a id="uc-iss-0177"></a>
### UC-ISS-0177 — Reject started backlog move

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move started work to backlog.

**Expected results**

- Issue must first return to unstarted stage.

Sources: [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0201](../features/issues.md#uc-iss-0201).

Note: Surface correction: The native More actions menu renders Move to backlog only while the current stage category is todo. Started work cannot submit this fresh native action; raw REST/MCP validation remains unchanged. A stale todo editor instead exercises revision conflict.

<a id="uc-iss-0178"></a>
### UC-ISS-0178 — Navigate status menu by keyboard

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Use arrows/Home/End/Enter/Escape in status popup.

**Expected results**

- Focus, selection and dismissal follow accessible menu semantics.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:155](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L155).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

<a id="uc-iss-0179"></a>
### UC-ISS-0179 — Preserve early status key intent

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Press navigation keys before transition choices finish loading.

**Expected results**

- Queued intent selects loaded eligible target, never an accidental retained value.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:155](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L155).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

<a id="uc-iss-0180"></a>
### UC-ISS-0180 — Preserve early priority key intent

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Press navigation keys before first priority page loads.

**Expected results**

- Queued intent applies to loaded priority choices.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:373](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L373).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

<a id="uc-iss-0181"></a>
### UC-ISS-0181 — Dismiss field popup

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Press Escape or click outside assignee/priority popup.

**Expected results**

- Popup closes without incidental write and trigger focus is restored.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:373](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L373).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

<a id="uc-iss-0182"></a>
### UC-ISS-0182 — Keep popup above narrow drawer

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open metadata popup inside a narrow board drawer.

**Expected results**

- Popover floats without shifting fields and follows viewport positioning.

Sources: [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.html#L1).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

<a id="uc-iss-0183"></a>
### UC-ISS-0183 — Navigate activity tabs

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Use Left/Right/Home/End on activity tabs.

**Expected results**

- Roving focus and selected panel update.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts).

<a id="uc-iss-0184"></a>
### UC-ISS-0184 — Protect dirty route navigation

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Navigate away with issue-form draft.

**Expected results**

- Draft guard asks before discarding.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

<a id="uc-iss-0185"></a>
### UC-ISS-0185 — Ignore prior-session results

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change user session while issue reads are pending.

**Expected results**

- Old issues, choices and responses cannot populate new session state.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Related test files: [issue-field-popups.spec.ts](../../../frontend/e2e/issue-field-popups.spec.ts), [issue-status-menu.spec.ts](../../../frontend/e2e/issue-status-menu.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

<a id="uc-iss-0186"></a>
### UC-ISS-0186 — Delete issue permanently

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt to permanently delete an issue.

**Expected results**

- No ordinary native issue delete action is currently exposed; archive is the implemented lifecycle action.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:41](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L41).

Note: Inventory boundary, not an implemented acceptance promise.

<a id="uc-iss-0187"></a>
### UC-ISS-0187 — Find standard parents before paging

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A matching issue query has a first page containing only subtasks and a later page containing eligible standard parents.

**Steps**

1. Search matching work where 26 newer subtasks precede an older custom standard parent.

**Expected results**

- The eligible custom standard parent is offered on the first candidate page; subtasks are excluded before pagination and totals. Parent selection applies its child filter.

Sources: [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:172](../../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L172).

Related test files: [coverage-issue-discovery.spec.ts](../../../frontend/e2e/coverage-issue-discovery.spec.ts).

Gaps: [GAP-ISS-002](../gaps.md#gap-iss-002).

Note: Reproduced a hidden parent behind a subtask-only first page. Typed native typeBehavior filtering now runs before SQL LIMIT/count and participates in cursor ownership.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-iss-0188"></a>
### UC-ISS-0188 — Reject overlong issue title through service

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a title exceeding 200 Unicode characters.

**Expected results**

- Validation rejects creation without creating an issue.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:61](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L61), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0025](../features/issues.md#uc-iss-0025).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0025. Its browser behavior remains in the original stable case.

<a id="uc-iss-0189"></a>
### UC-ISS-0189 — Match issue title fragments through service

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Search using an allowed issue title fragment.

**Expected results**

- Matching authorized issue summaries are returned.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0032](../features/issues.md#uc-iss-0032).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0032. Its browser behavior remains in the original stable case.

<a id="uc-iss-0190"></a>
### UC-ISS-0190 — Read issue search cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read an issue search page and its next scoped cursor.

**Expected results**

- Later distinct summaries return in the requested order without duplicates.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0069](../features/issues.md#uc-iss-0069).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0069. Its browser behavior remains in the original stable case.

<a id="uc-iss-0191"></a>
### UC-ISS-0191 — Read empty issue search result

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Search using a nonmatching permitted query.

**Expected results**

- The page has zero items, a zero matching total and no continuation.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0071](../features/issues.md#uc-iss-0071).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0071. Its browser behavior remains in the original stable case.

<a id="uc-iss-0192"></a>
### UC-ISS-0192 — Read complete saved filter values

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in as the owner of the private user state under examination.

**Steps**

1. Read a saved search containing multiple values per filter.

**Expected results**

- The stored typed filter projection retains every saved value.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28), [backend/internal/features/issues/organization.go:298](../../../backend/internal/features/issues/organization.go#L298), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:487](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L487).

Shared business operations: `list_saved_searches`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0149](../features/issues.md#uc-iss-0149).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0149. Its browser behavior remains in the original stable case.

<a id="uc-iss-0193"></a>
### UC-ISS-0193 — Reject stale target-field prior value

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Patch a field whose prior value changed concurrently.

**Expected results**

- Conflict returns current typed issue state and does not overwrite the winning value.

Sources: [backend/internal/features/issues/canonical_field_patch.go:45](../../../backend/internal/features/issues/canonical_field_patch.go#L45), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `patch_issue_field_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0158](../features/issues.md#uc-iss-0158).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0158. Its browser behavior remains in the original stable case.

<a id="uc-iss-0194"></a>
### UC-ISS-0194 — Reject stale full issue edit

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Update an issue using an outdated revision.

**Expected results**

- Conflict reports the current issue without applying the stale full edit.

Sources: [frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html:18](../../../frontend/src/app/features/issues/pages/issue-detail/modern-issue-detail.page.html#L18), [frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts:525](../../../frontend/src/app/features/issues/components/modern-issue-field-editor/modern-issue-field-editor.component.ts#L525).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0162](../features/issues.md#uc-iss-0162).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0162. Its browser behavior remains in the original stable case.

<a id="uc-iss-0195"></a>
### UC-ISS-0195 — Reject stale saved-search update

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Update a saved search with an outdated revision.

**Expected results**

- Revision validation rejects the stale write and preserves the accepted saved filters.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28).

Shared business operations: `save_issue_search`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-ISS-0167](../features/issues.md#uc-iss-0167).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0167. Its browser behavior remains in the original stable case.

<a id="uc-iss-0196"></a>
### UC-ISS-0196 — Deny issue writes after current permission revocation

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Write issue content after current project write access is revoked.

**Expected results**

- Permission denies the write without changing stored issue fields.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Shared business operations: `update_issue_v2`, `patch_issue_field_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-ISS-0170](../features/issues.md#uc-iss-0170).

Note: Atomic service outcome separated from the native UI behavior in UC-ISS-0170. Its browser behavior remains in the original stable case.

<a id="uc-iss-0197"></a>
### UC-ISS-0197 — Read scoped eligible assignee matches

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Query current eligible project assignees with text.

**Expected results**

- Only matching currently assignable project people are returned.

Sources: [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html:24](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.html#L24), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:366](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L366).

Shared business operations: `list_assignees`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-ISS-0046](../features/issues.md#uc-iss-0046).

Note: Atomic service outcome separated from native UI case UC-ISS-0046.

<a id="uc-iss-0198"></a>
### UC-ISS-0198 — Read current issue transition targets

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read issue transitions at its current workflow and stage.

**Expected results**

- Current workflow stage targets and their current eligibility/review metadata are returned.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html:1](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.html#L1), [backend/internal/features/issues/canonical_move.go:36](../../../backend/internal/features/issues/canonical_move.go#L36).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-ISS-0119](../features/issues.md#uc-iss-0119).

Note: Atomic service outcome separated from native UI case UC-ISS-0119.

<a id="uc-iss-0199"></a>
### UC-ISS-0199 — Offer behavior-preserving issue types

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open the full editor for an existing standard issue.

**Expected results**

- Subtask-behavior types are absent from the native type choices; the fixed parent relationship is unchanged.

Sources: [backend/internal/features/issues/canonical_update.go:34](../../../backend/internal/features/issues/canonical_update.go#L34).

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-ISS-0174](../features/issues.md#uc-iss-0174).

Note: Atomic native counterpart of UC-ISS-0174. This case preserves the actual control behavior separately from raw REST/MCP argument validation.

<a id="uc-iss-0200"></a>
### UC-ISS-0200 — Bound native saved-search names to 80 characters

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Enter 81 characters into the native private saved-search name field.

**Expected results**

- The input maxlength is 80 and retains exactly 80 characters; typing does not change the selected saved search.

Sources: [frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts:28](../../../frontend/src/app/features/issues/components/saved-searches/saved-searches.component.ts#L28).

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

Related cases: [UC-ISS-0153](../features/issues.md#uc-iss-0153).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-iss-0201"></a>
### UC-ISS-0201 — Hide backlog move for started issues

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open More actions for an issue in an in-progress, review or done stage.

**Expected results**

- Move to backlog is absent until the issue is returned to a todo category stage.

Sources: [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts), [coverage-issue-native-criteria.spec.ts](../../../frontend/e2e/coverage-issue-native-criteria.spec.ts).

Related cases: [UC-ISS-0177](../features/issues.md#uc-iss-0177).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-iss-0202"></a>
### UC-ISS-0202 — Discard a pending creation-upload draft after project write access is revoked

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A signed-in project writer has opened native issue creation with a valid title and one queued attachment.
- The issue creation has been accepted, while the first initial-upload request is still pending.

**Steps**

1. While the first initial-upload request is pending, an authorized administrator changes this actor to a project viewer.
2. Allow the pending upload request to reach the real service and return its current permission result.
3. After observing the denial, restore project write access and reopen native creation in the same signed-in SPA and original host scope.

**Expected results**

- The initial upload is rejected with the real 403 forbidden result; the old create dialog closes and creation is unavailable while the actor is a viewer.
- No later upload command is sent, no attachment is published, and the already accepted issue is preserved exactly once.
- After write access is restored, the same-host create form opens with an empty title and no previous attachment queue.

Sources: [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:712](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L712), [frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts:186](../../../frontend/src/app/features/issues/pages/issue-list/modern-issue-list.page.ts#L186), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:126](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L126), [frontend/src/app/core/auth/auth.service.ts:44](../../../frontend/src/app/core/auth/auth.service.ts#L44), [frontend/src/app/core/drafts/drafts.service.ts:81](../../../frontend/src/app/core/drafts/drafts.service.ts#L81), [backend/internal/features/attachments/resumable.go:147](../../../backend/internal/features/attachments/resumable.go#L147).

Shared business operations: `create_issue_v2`, `start_asset_upload`.

Related test files: [coverage-board-create-upload-ownership.spec.ts](../../../frontend/e2e/coverage-board-create-upload-ownership.spec.ts).

Related cases: [UC-ISS-0019](../features/issues.md#uc-iss-0019), [UC-ISS-0020](../features/issues.md#uc-iss-0020), [UC-ISS-0021](../features/issues.md#uc-iss-0021).

Note: One canonical native case is exercised from both Kanban-board and Issues-list creation; host variants do not create duplicate use-case IDs.

Note: This boundary occurs after issue creation was accepted. It differs from a recoverable same-writer upload failure: current authorization invalidation discards the old private queue without creating another issue.

Note: The administrative membership change establishes the concurrent permission precondition. This web case does not claim REST/MCP proof for modal closure or draft clearing.

Note: Existing test links and source references describe intended coverage only; passing runtime evidence is recorded separately.

Note: A separately delayed issue-create acknowledgement is outside this case.

<a id="uc-iss-0203"></a>
### UC-ISS-0203 — Ignore a late accepted creation reply after another account signs in

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A project writer has submitted native board issue creation with a private unsaved form title.
- The service has accepted that issue creation, but its success acknowledgement has not yet reached the original form.

**Steps**

1. An authorized administrator deactivates the original account while a genuine asset-policy request is pending.
2. Allow the real policy request to return 403, then use the visible local sign-in form to sign in as another authorized account in the same SPA.
3. Use native search and project navigation to return to the original board under the new account.
4. Release the old accepted creation acknowledgement and open a fresh native Create issue form.

**Expected results**

- The old acknowledgement does not restore the previous account's private title or a draft-restored notice in the new account's fresh form; its title is empty.
- The originally accepted issue remains stored exactly once; releasing its late acknowledgement does not create a duplicate issue.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:420](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L420), [frontend/src/app/core/auth/auth.service.ts:44](../../../frontend/src/app/core/auth/auth.service.ts#L44), [frontend/src/app/core/drafts/drafts.service.ts:81](../../../frontend/src/app/core/drafts/drafts.service.ts#L81), [frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts:712](../../../frontend/src/app/features/issues/components/modern-issue-form/modern-issue-form.component.ts#L712).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-board-create-upload-ownership.spec.ts](../../../frontend/e2e/coverage-board-create-upload-ownership.spec.ts).

Related cases: [UC-ISS-0022](../features/issues.md#uc-iss-0022), [UC-ISS-0202](../features/issues.md#uc-iss-0202).

Note: This is the distinct delayed creation-acknowledgement boundary; UC-ISS-0202 covers an already acknowledged creation whose initial file upload is denied after project-role revocation.

Note: Account replacement is exercised through genuine local account deactivation, a real service 403 and visible local sign-in controls. This case makes no OAuth-provider or hosted identity acceptance claim.

Note: The new account opens a fresh form after the stale acknowledgement is released. This case does not claim preservation of an already-edited new-account form or clearing of a previously nonempty file queue.

Note: Administrative account changes establish the concurrent precondition. Stateless REST/MCP calls cannot prove this native form/draft ownership outcome.

Note: Existing test links and source references describe intended coverage only; passing runtime evidence is recorded separately.
