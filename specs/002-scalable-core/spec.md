# Feature Specification: Scalable GateGoldJira Core

**Feature Branch**: `main` (feature selection is independent of branch name)
**Created**: 2026-10-13
**Status**: Ready for planning
**Input**: Continue implementing the reviewed design, prioritizing speed, simple ownership, static typing and safe extensions while preserving current work.

## User Scenarios & Testing

### User Story 1 - Find and edit work quickly (Priority: P1)

Employees find issues by number/key/title as they type and save a field without overwriting a teammate's unrelated changes.
**Why this priority**: These are frequent actions and the user's main speed concern.
**Independent Test**: Search English/Arabic titles/numbers and edit different fields from two sessions.

**Acceptance Scenarios**:

1. Given DEMO-2, typing `2`, `0002` or `DEMO-2` finds it; literal punctuation, Arabic and existing key-prefix behavior retain their meaning.
2. Given two readers, concurrent priority/assignee edits preserve both; conflicting changes to the same field are explained.
3. An unchanged save produces no revision, audit or notification change; a lost response with the original retry reference has one business outcome.
4. Revoked callers cannot write or replay inaccessible results, through either access channel.

### User Story 2 - Delegate project configuration (Priority: P1)

Project administrators manage their own project's people, types, priorities and defaults.
**Why this priority**: Teams need local control without company-wide administration.
**Independent Test**: Promote a member in one project and verify another project remains inaccessible.

**Acceptance Scenarios**:

1. Project admins manage configuration/members; members edit work; viewers read; company admins retain authority.
2. Story/Urgent become usable in create/edit/search/assistant operations with accurate names and behavior.
3. Retiring a default installs an active replacement atomically; existing references stay readable.

### User Story 3 - Evolve workflows safely (Priority: P1)

Different issue types use appropriate processes; defaults can change while existing work remains usable.
**Why this priority**: Board-owned copies limit teams and make edits expensive.
**Independent Test**: Use separate bug/task flows and change a default while existing issues progress.

**Acceptance Scenarios**:

1. Allowed moves, completion prerequisites and initial stages are consistent across boards and access channels.
2. Default changes affect new issues; old work keeps a valid assigned process until an explicit bounded migration.
3. Closed intake still lets existing issues leave; retirement rejects stranded work or broken completion paths.
4. Active stage configuration and default-board coverage change atomically.

### User Story 4 - Arrange independent boards (Priority: P1)

Teams group/name/order their own columns and cards, using optional warning or hard work limits.
**Why this priority**: Board layout should fit a team without copying issue data.
**Independent Test**: Group QA/Review on one board, split them on another and compare the same issue.

**Acceptance Scenarios**:

1. Column mappings and manual order are independent; issues/comments/assignments remain shared.
2. Ambiguous stage destinations ask for a valid move; layout never bypasses workflow rules.
3. Counts cover the saved view; competing last-slot moves obey eligible hard limits transactionally.
4. Indirect/time-changing filters remain warning views and are rejected for hard mode.
5. First/deep/terminal pages preserve order and indicate further results correctly.

### User Story 5 - Use typed fields and approvals (Priority: P2)

Teams collect project-specific information and require attributed review before selected moves.
**Why this priority**: Controlled extensions support company processes while ordinary fields stay simple.
**Independent Test**: Configure text/number/date/choice/user values and race content changes with approvals.

**Acceptance Scenarios**:

1. Exactly the selected value kind is accepted; decimal precision and inactive historical choices are preserved.
2. Moves require current fields/permissions/distinct eligible approvals; content/rule changes invalidate their context.
3. Discussion and board order do not invalidate approval; explicit resubmission preserves old votes and starts a new review.
4. Retirement cannot leave active rules impossible to satisfy.

### User Story 6 - Share files consistently (Priority: P2)

Employees paste pictures and attach documents through one recoverable file lifecycle.
**Why this priority**: Separate picture/file implementations duplicate publication and retry logic.
**Independent Test**: Paste Arabic comments, cancel document drafts, retry interrupted transfers and inspect old versions.

**Acceptance Scenarios**:

1. Image/document identity, retries and publication are shared while only validated images render inline.
2. Drafts stay private until publication; canceling a draft does not expose a document.
3. Detach preserves historical content; abandoned transfers reconcile in bounded batches.
4. Configured resumable uploads are verified before publication and do not monopolize ordinary saves.
5. Existing IDs, attribution, keys, links and file bytes survive migration.

### User Story 7 - Adopt the new core under load (Priority: P1)

The company preserves its work and gets consistent, responsive daily use from both access channels.
**Why this priority**: Speed is useful only with correct existing behavior.
**Independent Test**: Migrate a preserved fixture and run simultaneous daily workflows with measured load.

**Acceptance Scenarios**:

1. Numbers, Arabic/rich text, comments/versions, assignments, blockers, subtasks, labels, planning, watchers, notifications and imports survive.
2. Revocation, archive, completion and retries remain correct under races.
3. Older supported operations stay available during migration; unrepresentable new configuration is gated by a documented client transition.
4. Evidence distinguishes local/hosted, warm/idle-start, sequential/competing writes.

### Edge Cases

- Long/zero/leading-zero digit strings; literal percent/underscore/backslash; absent short Arabic text; empty results.
- Divergent/archived board workflows, retired tokens, category filters, old retry results and object-key collisions.
- Same-field conflict, different-field merge, defaults changing during creation, last-slot capacity and graph/completion races.
- Sparse/stale/full ranks, deep cursors, selective filters and exhausted branches.
- Invalid field choices, missing defaults, pending approval and no-op versus resubmission.
- Expired leases, interrupted uploads, canceled drafts and cleanup/publication races.

## Requirements

### Functional Requirements

- **FR-001**: Preserve current data, access, completion and history behavior throughout adoption.
- **FR-002**: Provide cancelable bounded live search with existing number/key/prefix/literal Unicode semantics.
- **FR-003**: Save individual fields with prior-value checks, unrelated-change merging and no-op preservation.
- **FR-004**: Provide company-admin/project-admin/member/viewer capabilities consistently.
- **FR-005**: Provide named types/priorities with active defaults and historical references.
- **FR-006**: Own workflow stages/moves independently of board layout.
- **FR-007**: Switch defaults without invalidating work; migrate in bounded restartable groups.
- **FR-008**: Preserve retirement, intake, completion paths and default-board coverage.
- **FR-009**: Provide independent grouped columns and manual card order.
- **FR-010**: Preserve live pagination and skip exhausted ordering branches.
- **FR-011**: Provide saved-view warnings and transactional hard limits for deterministic eligible views.
- **FR-012**: Provide typed extension fields and required-field rules.
- **FR-013**: Provide attributed approval/context checks and explicit resubmission.
- **FR-014**: Unify file drafts/publication/retries/reference-aware cleanup while preserving image safety.
- **FR-015**: Provide authoritatively validated configured resumable uploads.
- **FR-016**: Preserve shared business outcomes, idempotency, attribution and revocation rechecks.
- **FR-017**: Define migration/client compatibility and explain unsupported legacy operations.
- **FR-018**: Verify behavior, concurrency, migration, typing and representative workloads through automated checks.

### Follow-up requirements (2026-10-15)

The user explicitly requested completion of native bulk editing and saved-search UI, safe public activation and correction of the measured 200k broad-board slowdown.

- **FR-019**: Native users can create, apply, update, rename and remove private saved searches. Keep every multi-value and hidden predicate; editing one control changes only its corresponding predicate. Preserve exact pending save intentions and references across in-app navigation, and require explicit review after a stale revision.
- **FR-020**: Native bulk actions use scoped canonical choices and selected-field CAS for assignee/priority/date, guarded workflow moves and organization commands. Keep partial failures selected, allow explicit current-value review and freeze uncertain requests with their original references. Leaving an active batch stops unsubmitted changes and preserves the in-flight intention; logout clears private drafts.
- **FR-021**: Company/project administrators can explicitly review and activate modern issue access through shared REST/MCP rules. Validate current defaults, creation/workflow progression and default-board coverage under lifecycle guards; require confirmed configuration/project/board revisions, reject stale or unsafe reviews, preserve data and old accepted receipts, and record a single idempotent mode change. The migration never flips a company automatically.
- **FR-022**: Keep exact, consistent board totals while meeting the existing 500 ms read/750 ms save p95 targets at 200k issues and 100 active local users. Retain before/after query plans and repeated workloads, with no new mutable table, stale cache or increased latency budget.

### Key Entities

- **Project configuration**: People, named choices, defaults and lifecycle policy owned by a project.
- **Workflow/binding**: Permitted process and issue types allowed to use it.
- **Issue**: Stable work identity with an assigned process, core fields and optional typed values.
- **Board/column**: Saved view, stage grouping, order and capacity policy.
- **Approval**: Attributed decision tied to current work/rules.
- **Attachment/session**: Recoverable private/published file lifecycle.
- **History**: Retained discussion, events, retries, planning and notification outcomes.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All preserved fixture identities and historical references keep their meaning after migration.
- **SC-002**: All field, capacity, revocation and completion race scenarios preserve valid outcomes without lost changes.
- **SC-003**: At least 95% of warm reads complete within 500 ms and saves within 750 ms in the measured environment; common reads/saves target 200/300 ms as stretch goals.
- **SC-004**: At least 95% of warm browser navigation completes within two seconds and hosted idle-start navigation within five seconds.
- **SC-005**: Report measured 100,000-issue/100-user mixed workloads, including a hot project; growth trials identify the next bottleneck without claiming unlimited capacity.
- **SC-006**: Every new operation passes shared web/assistant permission and outcome checks.
- **SC-007**: Configuration changes leave zero stranded live issues or missing creation defaults.
- **SC-008**: No-op updates produce zero extra revisions/change notifications; retries produce no duplicate business outcome.

## Assumptions

- Continue authorizes local implementation of the reviewed V2 proposal. One company, existing subtask depth and same-project links remain the scope.
- Existing authentication and separate app hosting are reused; local test identities remain available.
- Automated risk-focused acceptance is included because preserved data, permissions and transactions change.
- The target has 44 app tables; additive rollout may temporarily retain legacy structures.
- Real provider/cloud/restore acceptance requires the existing available authorized external target; local evidence cannot close those gates.
- Independently verified slices keep the existing tracker usable between migrations.

### Code quality acceptance follow-up (2026-10-16)

- Administrative project editors must never retain a previous project's request target after same-route SPA navigation; existing access and dirty-draft guards still apply.
- Bulk edits require a current scoped target. Changing project/workflow or loading different choices cannot submit an earlier target, and must not rewrite an uncertain original retry.
- The supported migration command completes guarded historical backfills before retirement, preserves original content and assets, and is safe to repeat.
- Strict test compilation and complete isolated browser acceptance run in CI without requiring production credentials or exporting private identity/trace artifacts.
