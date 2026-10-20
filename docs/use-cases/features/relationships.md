# Subtasks, blockers and retained issue relations

Independent child work, guarded prerequisite graph, live candidate lookup and relates-to/duplicate links.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `subtaskUi`: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1)
- `subtaskLogic`: [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1)
- `nativeCreate`: [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49)
- `parentRules`: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92)
- `completion`: [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50)
- `dependenciesUi`: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1)
- `dependencies`: [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201)
- `dependencyPages`: [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106)
- `dependencyRules`: [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142)
- `linksUi`: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113)
- `links`: [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178)
- `moves`: [backend/internal/features/issues/canonical_move.go:119](../../../backend/internal/features/issues/canonical_move.go#L119)
- `contracts`: [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7)
- `legacyChild`: [backend/internal/features/issues/subtasks.go:38](../../../backend/internal/features/issues/subtasks.go#L38)
- `legacyMode`: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8)
- `legacyChildMcp`: [backend/internal/features/issues/mcp.go:47](../../../backend/internal/features/issues/mcp.go#L47)

## Cases

<a id="uc-rel-0001"></a>
### UC-REL-0001 — Open subtask creation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Add subtask.

**Expected results**

- Inline child creation form opens under current parent.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0002"></a>
### UC-REL-0002 — Create independent subtask

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create a valid child.

**Expected results**

- Distinct key/issue is created with fixed parent and default subtask type.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0003"></a>
### UC-REL-0003 — Assign subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create/edit child with its own assignee.

**Expected results**

- Child assignment does not replace parent assignment.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0004"></a>
### UC-REL-0004 — Prioritize subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create/edit child priority.

**Expected results**

- Child priority remains independent.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0005"></a>
### UC-REL-0005 — Schedule subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create/edit child due date.

**Expected results**

- Child calendar date remains independent.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0006"></a>
### UC-REL-0006 — Label subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create/edit child labels.

**Expected results**

- Child retains its own selected labels.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0007"></a>
### UC-REL-0007 — Describe subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create/edit child description.

**Expected results**

- Child has its own saved content.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0008"></a>
### UC-REL-0008 — Discuss subtask independently

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post comment on child.

**Expected results**

- Child discussion remains separate from parent.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0009"></a>
### UC-REL-0009 — Attach files to subtask

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload file to child.

**Expected results**

- Attachment belongs to child issue.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0010"></a>
### UC-REL-0010 — Cancel subtask creation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel child creation form.

**Expected results**

- No child is created and dirty draft confirmation applies.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0011"></a>
### UC-REL-0011 — Restore child draft

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen retained same-tab draft for this parent.

**Expected results**

- Draft restores in correct parent scope.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0012"></a>
### UC-REL-0012 — Reload subtasks

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Reload subtasks and progress.

**Expected results**

- Current child list and progress return.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `list_subtasks`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0013"></a>
### UC-REL-0013 — Page subtasks

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Next subtasks page.

**Expected results**

- Further children display.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `list_subtasks`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0014"></a>
### UC-REL-0014 — Open child detail

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Activate child issue row.

**Expected results**

- Correct child detail opens.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0015"></a>
### UC-REL-0015 — Open parent from child

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Open parent.

**Expected results**

- Correct fixed parent opens.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0016"></a>
### UC-REL-0016 — Filter all children

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose View all in parent subtasks section.

**Expected results**

- Issues opens with project and parent filter.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0017"></a>
### UC-REL-0017 — Complete one child

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move child to Done.

**Expected results**

- Parent completed/total progress updates.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0018"></a>
### UC-REL-0018 — Complete final child

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Complete last unfinished child.

**Expected results**

- Parent progress reaches total without automatically completing parent.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0019"></a>
### UC-REL-0019 — Reopen completed child

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen child of unfinished parent.

**Expected results**

- Parent completed count decreases.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0020"></a>
### UC-REL-0020 — Complete ready parent explicitly

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move parent with all prerequisites finished to Done.

**Expected results**

- Parent completes only through explicit transition.

Sources: [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1), [frontend/src/app/features/issues/components/subtasks/subtasks.component.ts:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.ts#L1), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Note: General child field/comment/file details are owned by corresponding issue/collaboration/asset cases.

<a id="uc-rel-0021"></a>
### UC-REL-0021 — Reject unfinished child completion guard

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move parent to Done with unfinished child.

**Expected results**

- Move rejects and identifies prerequisite work.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0022"></a>
### UC-REL-0022 — Reject nested child

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create subtask beneath a subtask.

**Expected results**

- Nested subtask is rejected.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0090](../features/relationships.md#uc-rel-0090).

Note: Surface correction: A child renders its fixed parent link instead of an Add subtask form. Nested parent IDs are raw typed creation request validation. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0023"></a>
### UC-REL-0023 — Reject child on completed parent

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create child while parent is Done.

**Expected results**

- Parent must be reopened first.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0024"></a>
### UC-REL-0024 — Reject child reopen under done parent

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen completed child while parent remains Done.

**Expected results**

- Reopen is rejected until parent reopens.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `move_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0025"></a>
### UC-REL-0025 — Reject immutable reparenting

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Edit child parent through ordinary issue edit.

**Expected results**

- Parent relationship cannot be reassigned.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `update_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-REL-0076](../features/relationships.md#uc-rel-0076).

Note: Operation correction: ordinary parent reassignment is tested through update_issue_v2, whose editable contract excludes a writable parent.

Note: Surface correction: The native complete edit form has no writable parent field. Rejection of an extra editable.parentId property belongs to the published REST/MCP schema; native immutable-parent absence remains independently covered. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0026"></a>
### UC-REL-0026 — Reject stale parent creation

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create child using outdated parent revision.

**Expected results**

- Conflict prevents blind child creation.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0027"></a>
### UC-REL-0027 — Retry uncertain child creation

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry original child request after lost accepted response.

**Expected results**

- Original reference yields one child.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-rel-0028"></a>
### UC-REL-0028 — Prevent viewer child creation

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt Add subtask as viewer.

**Expected results**

- UI has no write action and server rejects mutation.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [subtasks.spec.ts](../../../frontend/e2e/subtasks.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0085](../features/relationships.md#uc-rel-0085).

Note: Surface correction: Absence of a native write action requires browser assertions independently of server denial. All original expected behavior remains on the native case.

<a id="uc-rel-0029"></a>
### UC-REL-0029 — Open blocker search

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Add blocker.

**Expected results**

- Search panel opens with initial lookup.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0030"></a>
### UC-REL-0030 — Search blocker title live

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type title fragment.

**Expected results**

- Matching same-project candidates update automatically.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0084](../features/relationships.md#uc-rel-0084).

Note: Surface correction: Automatically replacing displayed blocker candidates while typing is native request ownership. All original expected behavior remains on the native case.

<a id="uc-rel-0031"></a>
### UC-REL-0031 — Search blocker key live

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type issue key.

**Expected results**

- Matching same-project candidate appears.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-rel-0032"></a>
### UC-REL-0032 — Search blocker number live

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type bare numeric issue number.

**Expected results**

- Exact project issue is found without search click.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0079](../features/relationships.md#uc-rel-0079).

Note: Surface correction: Live numeric typing without a submit click is native behavior. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0033"></a>
### UC-REL-0033 — Search leading-zero number

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type issue number with leading zeros.

**Expected results**

- Equivalent issue number is found.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-rel-0034"></a>
### UC-REL-0034 — Exclude current issue from blockers

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Search for current issue.

**Expected results**

- Current issue is not a selectable blocker.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0035"></a>
### UC-REL-0035 — Select blocker candidate

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Select for a candidate.

**Expected results**

- Confirmation identifies selected blocker key.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0036"></a>
### UC-REL-0036 — Confirm blocker link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Add selected blocker.

**Expected results**

- Blocked By relationship appears with blocker status and responsible developer.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0037"></a>
### UC-REL-0037 — Inspect inverse blocked work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open blocker issue.

**Expected results**

- Blocks section shows dependent issue.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0038"></a>
### UC-REL-0038 — Cancel blocker selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Cancel adding blocker.

**Expected results**

- Panel closes without linking.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0039"></a>
### UC-REL-0039 — Page blocker candidates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose More blocker candidates.

**Expected results**

- Further candidate page appears.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0040"></a>
### UC-REL-0040 — Page direct blockers

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose More blockers.

**Expected results**

- Further Blocked By relationships appear.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-rel-0041"></a>
### UC-REL-0041 — Page dependents

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose More dependent issues.

**Expected results**

- Further Blocks relationships appear.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-rel-0042"></a>
### UC-REL-0042 — Remove direct blocker

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Remove blocker.

**Expected results**

- Relationship is removed and blocked count refreshes.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `remove_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0043"></a>
### UC-REL-0043 — Refresh relationships

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Reload dependencies.

**Expected results**

- Current graph revision and both directions reload.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-rel-0044"></a>
### UC-REL-0044 — Show empty blocker search

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type nonmatching query.

**Expected results**

- No matching other issues appears after search settles.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

<a id="uc-rel-0045"></a>
### UC-REL-0045 — Retry blocker lookup

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Retry search after request failure.

**Expected results**

- Same search is retried without selecting stale result.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0079](../features/relationships.md#uc-rel-0079).

Note: Surface correction: Retrying without selecting an earlier stale result is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0046"></a>
### UC-REL-0046 — Complete blocker

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move unfinished blocker to Done.

**Expected results**

- Dependent becomes unblocked when no unfinished blockers remain.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `move_issue_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0047"></a>
### UC-REL-0047 — Reopen blocker

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen completed blocker.

**Expected results**

- Dependent unfinished-blocker state increases.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `move_issue_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0048"></a>
### UC-REL-0048 — Complete unblocked dependent

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move dependent after blockers finish.

**Expected results**

- Dependent still requires its own explicit completion move.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `move_issue_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0049"></a>
### UC-REL-0049 — Guard unfinished blocker

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move dependent to Done while blocker unfinished.

**Expected results**

- Move fails with blocking issue details.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `move_issue_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0050"></a>
### UC-REL-0050 — Reject dependency self-link

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Link issue as its own blocker.

**Expected results**

- Validation rejects self-cycle.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0034](../features/relationships.md#uc-rel-0034).

Note: Surface correction: The blocker chooser excludes the current issue. Supplying its own UUID as blockerId is a raw REST/MCP argument case rather than a reachable native selection. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0051"></a>
### UC-REL-0051 — Reject direct graph cycle

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add inverse dependency creating two-issue cycle.

**Expected results**

- Validation rejects cycle.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0052"></a>
### UC-REL-0052 — Reject indirect graph cycle

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add edge creating longer cycle.

**Expected results**

- Validation rejects transitive cycle.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0053"></a>
### UC-REL-0053 — Reject parent-child graph cycle

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add edge creating cycle through parent/child prerequisite.

**Expected results**

- Validation rejects combined graph cycle.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0054"></a>
### UC-REL-0054 — Reject unfinished blocker on done work

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add unfinished blocker to completed dependent.

**Expected results**

- Dependent must be reopened first.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0055"></a>
### UC-REL-0055 — Reject foreign project blocker

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit blocker from different project.

**Expected results**

- Scoped validation rejects without leaking foreign issue.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0087](../features/relationships.md#uc-rel-0087).

Note: Surface correction: The blocker lookup is scoped to the current project and the issue project cannot be reassigned. A foreign blocker UUID cannot be selected through this native control. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0056"></a>
### UC-REL-0056 — Review stale graph link

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add/remove with stale issue/graph/relationship revisions.

**Expected results**

- Conflict preserves selected blocker for explicit review.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0080](../features/relationships.md#uc-rel-0080).

Note: Surface correction: Preserving the selected blocker during explicit conflict review is native state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0057"></a>
### UC-REL-0057 — Review current relationships

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Review current relationships.

**Expected results**

- Latest issue/graph state reloads before retry.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0043](../features/relationships.md#uc-rel-0043).

Note: Surface correction: The review control owns the pending link intention; graph reads remain separate. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0058"></a>
### UC-REL-0058 — Reject stale dependency cursor

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Continue paged dependencies after graph changes.

**Expected results**

- Conflict instructs first-page reload.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `list_dependencies`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0059"></a>
### UC-REL-0059 — Ignore slow earlier candidate

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Let previous query return after newer query.

**Expected results**

- Newer candidate set remains.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0079](../features/relationships.md#uc-rel-0079).

Note: Surface correction: Suppressing a late candidate search completion is native request-generation ownership. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-rel-0060"></a>
### UC-REL-0060 — Keep canceled search closed

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Complete lookup after Add blocker panel closes.

**Expected results**

- Late result cannot reopen canceled panel.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `search_issues_v2`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-REL-0079](../features/relationships.md#uc-rel-0079).

Note: Surface correction: A late result cannot reopen a native panel; the service has no panel lifetime. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0061"></a>
### UC-REL-0061 — Navigate blocker candidates

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Use arrows and Enter with blocker combo.

**Expected results**

- Active candidate and confirmation remain keyboard accessible.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0036](../features/relationships.md#uc-rel-0036).

Note: Surface correction: Keyboard candidate focus and confirmation are browser interaction. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-rel-0062"></a>
### UC-REL-0062 — Preserve mobile numeric selection

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select numeric result using narrow-screen keyboard interaction.

**Expected results**

- Intended blocker is confirmed and linked.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`.

Related test files: [dependencies.spec.ts](../../../frontend/e2e/dependencies.spec.ts), [blocker-live-search.spec.ts](../../../frontend/e2e/blocker-live-search.spec.ts).

Related cases: [UC-REL-0036](../features/relationships.md#uc-rel-0036).

Note: Surface correction: Narrow-screen keyboard selection cannot be tested with stateless API calls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-rel-0063"></a>
### UC-REL-0063 — Open related issues

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Expand Related issues.

**Expected results**

- Saved relations and current live search are exposed.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

<a id="uc-rel-0064"></a>
### UC-REL-0064 — Search related work

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type title/key/number in related issue search.

**Expected results**

- Matching same-project issues excluding self appear.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-REL-0083](../features/relationships.md#uc-rel-0083).

Note: Surface correction: Excluding self from the related picker is a native filter; stateless search has no generic self-exclusion argument. All original expected behavior remains on the native case.

<a id="uc-rel-0065"></a>
### UC-REL-0065 — Page related candidates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose More related issues.

**Expected results**

- Next candidate page appears.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `search_issues_v2`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

Related cases: [UC-REL-0082](../features/relationships.md#uc-rel-0082).

Note: Surface correction: Choosing More related issues and appending its visible candidates is native UI state. All original expected behavior remains on the native case.

<a id="uc-rel-0066"></a>
### UC-REL-0066 — Add relates-to relation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Relates to and Link issue.

**Expected results**

- Relation appears on both issues.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0067"></a>
### UC-REL-0067 — Add duplicates relation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Duplicates and Link issue.

**Expected results**

- Source says Duplicates and target says Duplicated by.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0068"></a>
### UC-REL-0068 — Remove relates-to relation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove a retained relates-to link.

**Expected results**

- Relation disappears without deleting issues.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0069"></a>
### UC-REL-0069 — Remove duplicates relation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove a retained duplicates link.

**Expected results**

- Direction-aware source unlink removes relation.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

<a id="uc-rel-0070"></a>
### UC-REL-0070 — Follow related issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Activate linked key/title.

**Expected results**

- Correct related issue detail opens.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts).

<a id="uc-rel-0071"></a>
### UC-REL-0071 — Reject self related link

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit related issue equal to source.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0089](../features/relationships.md#uc-rel-0089).

Note: Surface correction: Native related search filters out the current issue before rendering Link issue controls. Self target UUID validation is a distinct REST/MCP boundary. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0072"></a>
### UC-REL-0072 — Reject cross-project related link

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit target from another project.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0088](../features/relationships.md#uc-rel-0088).

Note: Surface correction: Native related lookup always sends the current project scope; a foreign-project target is not offered as a Link issue control. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0073"></a>
### UC-REL-0073 — Reject unsupported relation

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit unsupported relation kind.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0086](../features/relationships.md#uc-rel-0086).

Note: Surface correction: The native relation select has exactly relates_to and duplicates options; an arbitrary blocks relation token is a raw typed REST/MCP argument. All original expected behavior remains unchanged on its declared service transports.

<a id="uc-rel-0074"></a>
### UC-REL-0074 — Limit related links

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add relation when either issue already has 100.

**Expected results**

- Validation rejects additional relation.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-relationship-native-validation.spec.ts](../../../frontend/e2e/coverage-relationship-native-validation.spec.ts).

<a id="uc-rel-0075"></a>
### UC-REL-0075 — Review concurrent related change

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Link/unlink against stale issue revision.

**Expected results**

- Current issue is offered for deliberate review.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [automatic-work-search.spec.ts](../../../frontend/e2e/automatic-work-search.spec.ts), [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

Related cases: [UC-REL-0081](../features/relationships.md#uc-rel-0081).

Note: Surface correction: Offering deliberate review of a current issue after a rejected related-link edit is native conflict UI. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-rel-0076"></a>
### UC-REL-0076 — Reparent existing issue

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt changing an existing child parent.

**Expected results**

- No native reparent action is implemented; ordinary edit keeps parent immutable.

Sources: [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7), [frontend/src/app/features/issues/components/subtasks/subtasks.component.html:1](../../../frontend/src/app/features/issues/components/subtasks/subtasks.component.html#L1).

Related test files: [coverage-issue-native-residual.spec.ts](../../../frontend/e2e/coverage-issue-native-residual.spec.ts).

<a id="uc-rel-0077"></a>
### UC-REL-0077 — Create legacy compatibility child

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Authenticated caller has current project write access.
- Parent project remains in legacy mode; parent is a current non-Done top-level Task or Bug.
- Caller has the current parent revision and a fresh retry reference.

**Steps**

1. Call create_subtask with a valid title and current expectedParentRevision.

**Expected results**

- One independent Subtask is created under the fixed parent in the project initial stage, with its own key/reporter and optional independent fields; nested or completed parents are rejected.

Sources: [backend/internal/features/issues/subtasks.go:38](../../../backend/internal/features/issues/subtasks.go#L38), [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8), [backend/internal/features/issues/mcp.go:47](../../../backend/internal/features/issues/mcp.go#L47), [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92).

Shared business operations: `create_subtask`.

Related test files: [subtasks_test.go](../../../backend/internal/features/issues/subtasks_test.go), [subtasks_transport_test.go](../../../backend/internal/features/issues/subtasks_transport_test.go), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Note: Native child creation uses create_issue_v2. This compatibility action uses fixed legacy Subtask type, low/medium/high priorities (omitted priority becomes medium), no canonical type/workflow identifiers, and current expectedParentRevision. Parent identity and Subtask behavior remain fixed.

<a id="uc-rel-0078"></a>
### UC-REL-0078 — Reject fresh compatibility child in modern mode

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Authenticated caller has current project write access.
- Parent project uses modern core mode.
- Caller supplies valid child fields and a fresh retry reference.

**Steps**

1. Call create_subtask for the modern-mode parent.

**Expected results**

- No child is created; validation_failed on clientVersion directs caller to the version 2 issue API so canonical choice/workflow identities are preserved.

Sources: [backend/internal/features/issues/subtasks.go:38](../../../backend/internal/features/issues/subtasks.go#L38), [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8), [backend/internal/features/issues/mcp.go:47](../../../backend/internal/features/issues/mcp.go#L47), [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92).

Shared business operations: `create_subtask`.

Related test files: [subtasks_test.go](../../../backend/internal/features/issues/subtasks_test.go), [subtasks_transport_test.go](../../../backend/internal/features/issues/subtasks_transport_test.go), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Note: Native child creation uses create_issue_v2. This compatibility action uses fixed legacy Subtask type, low/medium/high priorities (omitted priority becomes medium), no canonical type/workflow identifiers, and current expectedParentRevision. Parent identity and Subtask behavior remain fixed.

<a id="uc-rel-0079"></a>
### UC-REL-0079 — Read exact numeric blocker candidates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Search the current project using a bare issue number.

**Expected results**

- The exact numbered authorized issue is returned as a candidate.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0032](../features/relationships.md#uc-rel-0032).

Note: Atomic service outcome separated from the native UI behavior in UC-REL-0032. Its browser behavior remains in the original stable case.

<a id="uc-rel-0080"></a>
### UC-REL-0080 — Reject stale dependency graph command

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Add or remove a dependency using stale issue/graph/relationship revisions.

**Expected results**

- Conflict rejects the stale graph mutation without changing the accepted relationships.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Shared business operations: `add_dependency`, `remove_dependency`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-REL-0056](../features/relationships.md#uc-rel-0056).

Note: Atomic service outcome separated from the native UI behavior in UC-REL-0056. Its browser behavior remains in the original stable case.

<a id="uc-rel-0081"></a>
### UC-REL-0081 — Reject stale related-link command

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a related-link change with an outdated issue revision.

**Expected results**

- The conflict reports the current issue and retains the winning relation.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `set_issue_link`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-REL-0075](../features/relationships.md#uc-rel-0075).

Note: Atomic service outcome separated from native UI case UC-REL-0075.

<a id="uc-rel-0082"></a>
### UC-REL-0082 — Read related-search cursor pages

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read same-project matching issue summaries with a bounded cursor page, then advance its cursor.

**Expected results**

- Distinct later matching summaries retain the project/query/sort scope without duplicates.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-REL-0065](../features/relationships.md#uc-rel-0065).

Note: Atomic service outcome separated from native case UC-REL-0065. Browser behavior and its stable ID are unchanged.

<a id="uc-rel-0083"></a>
### UC-REL-0083 — Read scoped potential related summaries

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Query potential related issue summaries by current project and matching text.

**Expected results**

- Returned summaries match the requested authorized project and text.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-REL-0064](../features/relationships.md#uc-rel-0064).

Note: Atomic service outcome separated from native case UC-REL-0064. Browser behavior and its stable ID are unchanged.

<a id="uc-rel-0084"></a>
### UC-REL-0084 — Read matching blocker titles

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Query authorized same-project issue title fragments.

**Expected results**

- Matching same-project summaries return with their current title and key.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/dependencies.go:106](../../../backend/internal/features/issues/dependencies.go#L106).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-REL-0030](../features/relationships.md#uc-rel-0030).

Note: Atomic service outcome separated from native case UC-REL-0030. Browser behavior and its stable ID are unchanged.

<a id="uc-rel-0085"></a>
### UC-REL-0085 — Deny viewer subtask creation

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt to create a subtask as a current project viewer.

**Expected results**

- The forbidden command creates no child and leaves parent progress unchanged.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Shared business operations: `create_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-issues.spec.ts](../../../frontend/e2e/coverage-issues.spec.ts).

Related cases: [UC-REL-0028](../features/relationships.md#uc-rel-0028).

Note: Atomic service outcome separated from native case UC-REL-0028. Browser behavior and its stable ID are unchanged.

<a id="uc-rel-0086"></a>
### UC-REL-0086 — Offer supported native relation kinds

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open related work and inspect the relation selector.

**Expected results**

- Only Relates to and Duplicates are offered; no unsupported relation token can be selected.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Related test files: [coverage-relationship-ui.spec.ts](../../../frontend/e2e/coverage-relationship-ui.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0073](../features/relationships.md#uc-rel-0073).

Note: Atomic native counterpart of UC-REL-0073. This case preserves the actual control behavior separately from raw REST/MCP argument validation.

<a id="uc-rel-0087"></a>
### UC-REL-0087 — Scope native blocker candidates to the project

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Search for a matching issue that exists in another project.

**Expected results**

- The foreign issue is absent from selectable blocker candidates.

Sources: [frontend/src/app/features/issues/components/dependencies/dependencies.component.html:1](../../../frontend/src/app/features/issues/components/dependencies/dependencies.component.html#L1), [backend/internal/features/issues/dependencies.go:201](../../../backend/internal/features/issues/dependencies.go#L201), [backend/internal/features/issues/prerequisites.go:142](../../../backend/internal/features/issues/prerequisites.go#L142), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50).

Related test files: [coverage-relationship-ui.spec.ts](../../../frontend/e2e/coverage-relationship-ui.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0055](../features/relationships.md#uc-rel-0055).

Note: Atomic native counterpart of UC-REL-0055. This case preserves the actual control behavior separately from raw REST/MCP argument validation.

<a id="uc-rel-0088"></a>
### UC-REL-0088 — Scope native related candidates to the project

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Search related work using a query matching current-project and foreign-project work.

**Expected results**

- Only current-project issues appear as selectable related candidates.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Related test files: [coverage-relationship-ui.spec.ts](../../../frontend/e2e/coverage-relationship-ui.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0072](../features/relationships.md#uc-rel-0072).

Note: Atomic native counterpart of UC-REL-0072. This case preserves the actual control behavior separately from raw REST/MCP argument validation.

<a id="uc-rel-0089"></a>
### UC-REL-0089 — Exclude the current issue from related candidates

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Search related work for the current issue key.

**Expected results**

- The current issue is absent from Link issue controls and the no-other-issues state is shown.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:113](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L113), [backend/internal/features/issues/organization.go:178](../../../backend/internal/features/issues/organization.go#L178).

Related test files: [coverage-relationship-ui.spec.ts](../../../frontend/e2e/coverage-relationship-ui.spec.ts), [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0071](../features/relationships.md#uc-rel-0071).

Note: Atomic native counterpart of UC-REL-0071. This case preserves the actual control behavior separately from raw REST/MCP argument validation.

<a id="uc-rel-0090"></a>
### UC-REL-0090 — Hide nested subtask creation

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open an existing subtask.

**Expected results**

- The fixed parent link is visible; Add subtask and Create subtask controls are absent.

Sources: [backend/internal/features/issues/prerequisites.go:92](../../../backend/internal/features/issues/prerequisites.go#L92), [backend/internal/features/issues/prerequisites.go:50](../../../backend/internal/features/issues/prerequisites.go#L50), [backend/internal/features/issues/canonical_create.go:49](../../../backend/internal/features/issues/canonical_create.go#L49), [backend/internal/features/issues/canonical_contracts.go:7](../../../backend/internal/features/issues/canonical_contracts.go#L7).

Related test files: [coverage-relationship-native-lifecycle.spec.ts](../../../frontend/e2e/coverage-relationship-native-lifecycle.spec.ts).

Related cases: [UC-REL-0022](../features/relationships.md#uc-rel-0022).

Note: Atomic native counterpart of UC-REL-0022. This case preserves the actual control behavior separately from raw REST/MCP argument validation.
