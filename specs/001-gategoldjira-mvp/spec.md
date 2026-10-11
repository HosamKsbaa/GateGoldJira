# Feature Specification: GateGoldJira MVP

**Feature Branch**: Not created; Git branching is not configured.

**Feature Directory**: specs/001-gategoldjira-mvp

**Created**: 2026-10-11

**Status**: Draft — requirements quality review passed; ready for planning.

**Input**: User description: "Create the MVP spec for GateGoldJira with projects, issues, assignments, kanban boards, comments and user roles, with web app and MCP access."

GateGoldJira gives one company a shared place to organize projects, assign work,
track progress, and discuss issues. Employees can work in the web app or through
an authorized MCP-connected assistant. Both channels act on the same company
records and enforce the same permissions.

All six user stories are required for the MVP. Priorities indicate delivery order,
not optional scope. Independent tests may use prepared users, projects, and issues
as fixtures without requiring the other stories' interfaces.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Control Company and Project Access (Priority: P1)

As an Administrator, I approve company users and give them access to the projects
they need. As an employee, I sign in and see only the work I am allowed to access.

**Why this priority**: Company work must be restricted to approved users before
either access channel is useful.

**Independent Test**: With a prepared Administrator account and two projects,
approve a user, grant a project role, sign in as that user, and exercise the role
matrix through each channel.

**Acceptance Scenarios**:

1. **Given** an approved active user, **When** they sign in, **Then** their identity
   is established and their project list contains only projects they can access;
   an unapproved or inactive user cannot access company records.
2. **Given** an Administrator, **When** they approve a user with a unique company
   email and display name and grant a project role, **Then** the user can access
   that project with the granted permissions; a duplicate email is rejected.
3. **Given** a Member in one project, **When** they create or edit an issue there,
   **Then** the action succeeds; attempts to change membership or access another
   project are denied without exposing the other project's records.
4. **Given** a Viewer, **When** they read a board, issue, or comment, **Then** it is
   available; creating or changing project content is denied.
5. **Given** an active user's existing session, **When** an Administrator removes
   their project membership, changes their role, or disables their account,
   **Then** the new permissions apply on the next action in both channels,
   assignments that become ineligible are cleared, and historical authorship remains.
6. **Given** only one active Administrator remains, **When** anyone tries to
   disable or demote that account, **Then** the action is rejected and company
   administration remains available.

---

### User Story 2 - Create and Organize Projects (Priority: P1)

As an Administrator, I create recognizable projects and archive completed projects
so the company's work stays organized without losing its history.

**Why this priority**: Projects provide the shared context for issues and access.

**Independent Test**: With a prepared Administrator and approved employee account,
create a project, edit its details, grant access, archive it, and restore it.

**Acceptance Scenarios**:

1. **Given** an Administrator, **When** they supply a valid project name, unused
   key, and optional description, **Then** the project is created with an empty
   board and can receive members; invalid fields produce clear field errors.
2. **Given** a project with existing issues, **When** its name or description is
   edited, **Then** those details change while its key and issue identifiers remain
   unchanged; attempts to reuse an existing key are rejected.
3. **Given** a project containing work and comments, **When** it is archived,
   **Then** authorized users can still read its history, it is excluded from the
   default active-project list, and content changes are rejected in both channels.
4. **Given** an archived project, **When** an Administrator restores it, **Then**
   its issues, comments, memberships, and board become available for normal use
   with their previous values.

---

### User Story 3 - Create, Find, and Assign Issues (Priority: P1)

As a Member, I record work, find relevant issues, and assign responsibility so the
team knows what needs attention and who is responsible.

**Why this priority**: Issue tracking and assignment are the core business value.

**Independent Test**: With a prepared project and active Member accounts, create
an issue, search for it, change its details, assign it, and verify saved values
after leaving and reopening the issue.

**Acceptance Scenarios**:

1. **Given** a writable project, **When** a Member creates an issue with only a
   valid title, **Then** it receives a unique project issue identifier, Task type,
   Medium priority, To Do status, no assignee, and the actual creator as reporter.
2. **Given** an issue, **When** a Member changes its title, description, type,
   priority, or assignee, **Then** valid changes persist and are visible when the
   issue is reopened, while its identifier, project, and reporter stay unchanged.
3. **Given** a writable project, **When** an issue is assigned to an active
   Administrator or project Member, **Then** that person becomes its only assignee;
   assigning a Viewer, inactive user, or unrelated user is rejected without changes.
4. **Given** an assigned issue, **When** its assignee is cleared, **Then** it becomes
   unassigned and disappears from that person's My Issues results.
5. **Given** accessible projects with issues, **When** a user searches by issue
   identifier or title and combines project, status, priority, type, or assignee
   filters, **Then** only matching accessible issues are returned with bounded
   pages; My Issues returns issues assigned to that user.
6. **Given** two users viewing the same issue revision, **When** one saves an
   update and the other saves a stale update, **Then** the second receives a
   conflict notice, the first update remains, and the second can review current
   values before making a new change.
7. **Given** a saved create command whose response was interrupted, **When** the
   same command is retried with its original retry reference, **Then** the original
   issue is returned and a second issue is not created.

---

### User Story 4 - Track Progress on a Kanban Board (Priority: P1)

As a Member, I view work by status and move issues as work starts or finishes so
the team can see progress at a glance.

**Why this priority**: The board makes issue progress visible and actionable.

**Independent Test**: With prepared issues in all three statuses, open their
project's board, filter cards, move one card with a pointer and another with a
keyboard, and verify the saved issue statuses.

**Acceptance Scenarios**:

1. **Given** a project with issues, **When** an authorized user opens its board,
   **Then** To Do, In Progress, and Done columns contain the corresponding cards,
   each showing its identifier, title, priority, and assignee or Unassigned.
2. **Given** a Member and a writable project, **When** they move an issue between
   any two columns, including reopening Done work, **Then** its status changes and
   agrees with its issue details; a keyboard-operable status control achieves the
   same result as dragging.
3. **Given** a filtered board with more matches than one page, **When** a user
   loads more cards in a column, **Then** additional matching cards appear without
   duplicates or omissions for an unchanged set, and the column count reflects
   all matches rather than only loaded cards.
4. **Given** a failed or conflicting status change, **When** the result is shown,
   **Then** the board represents the last confirmed state and explains that the
   move was not saved; Viewers and archived-project users cannot save moves.

---

### User Story 5 - Work Through an MCP-Connected Assistant (Priority: P1)

As an employee, I let an authorized assistant read and manage my company's work
through MCP so I can use the same tracker without opening each web screen.

**Why this priority**: MCP access is an explicitly required MVP access channel.

**Independent Test**: Using a prepared project and approved user, connect an MCP
client, discover available operations, read work, create an issue, assign it,
change its status, and add a comment. Confirm the same records in the web app.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** their MCP client discovers operations,
   **Then** each operation declares its purpose, required and optional inputs,
   result fields, and retry or conflict behavior without exposing company records
   during unauthenticated discovery.
2. **Given** an authorized user, **When** they list projects, search issues, read
   an issue or board, list comments, or find eligible assignees through MCP,
   **Then** the returned records, filters, and permissions match the web app.
3. **Given** a Member, **When** they create or edit an issue, assign it, move its
   status, add a comment, or edit their own comment through MCP, **Then** the
   permitted change is saved with their actual identity and is visible in the web
   app on its next read.
4. **Given** an Administrator, **When** they manage projects, approved users,
   memberships, or roles through MCP, **Then** the same validation, role rules,
   archive behavior, and last-Administrator protection apply as in the web app;
   reading activity history shows the actual actor, affected records, changes,
   time, and originating channel for each successful change.
5. **Given** a Viewer, revoked user, invalid input, stale revision, or retry,
   **When** a corresponding MCP operation is attempted, **Then** it produces the
   same business outcome as the web app and a distinguishable failure or original
   successful result, without unauthorized data changes or disclosure.
6. **Given** a user with limited access, **When** an MCP request supplies another
   person's identity or an inaccessible issue identifier, **Then** it cannot
   impersonate that person, reveal that issue, or bypass project permissions.

---

### User Story 6 - Discuss Work in Issue Comments (Priority: P2)

As a Member, I add context and updates to an issue so the team can discuss work
in the place where it is tracked.

**Why this priority**: Comments support collaboration after the core work record
and access controls are available.

**Independent Test**: With a prepared issue, two Members, and a Viewer, add and
edit a comment, read the discussion as the other users, and exercise ownership
and retry rules.

**Acceptance Scenarios**:

1. **Given** a writable issue, **When** a Member adds a nonblank plain-text comment,
   **Then** it is saved with its author and creation time and appears in oldest-
   first discussion order when the issue is reopened.
2. **Given** their own comment in a writable project, **When** its author edits it,
   **Then** the new text and an edited indicator appear while its original author
   and creation time remain; other users cannot edit it.
3. **Given** a Viewer and a discussion longer than one page, **When** they read
   comments and load more, **Then** they can read the full authorized discussion
   but cannot post or edit comments.
4. **Given** a blank, oversized, repeated-retry, or stale comment command,
   **When** it is submitted, **Then** invalid text is rejected, retrying the same
   successful add returns the original comment, and a stale edit cannot overwrite
   a newer edit.

### Edge Cases

- Empty project lists, boards, search results, and discussions show an understandable
  empty state and the next permitted action; a read-only user is not offered a write action.
- A title, project name, or comment containing only whitespace is invalid. Text
  containing markup is displayed as plain text, without running its content.
- Project keys and user emails that differ only by letter case are duplicates.
  Separate intentional create commands may create issues with identical titles.
- A membership or account change made after a form or assistant session opens is
  rechecked when the next action is submitted, including assignee eligibility.
- Losing assignment eligibility clears current assignments but keeps prior
  assignments in history, along with reporter and comment attribution. Restoring
  access does not automatically reassign old work.
- Archiving a project while someone edits it causes subsequent content writes to
  fail; an Administrator may still manage its membership or restore it.
- Simultaneous issue creation never gives two issues the same identifier. Identifier
  gaps are allowed; issued identifiers are never reused or renumbered.
- A stale card move, issue edit, comment edit, or administrative change cannot
  silently replace a newer change. The user receives current state to review.
- Retrying an already successful command returns the saved result after checking
  the caller's current access; an old retry cannot bypass revoked access.
- Losing connectivity never presents an unconfirmed write as saved. A retry keeps
  the original command's retry reference; an intentional new action uses a new one.
- An unknown record and an inaccessible record produce the same unavailable
  outcome, including in searches and counts.
- Large boards and discussions load in bounded portions. For an unchanged result
  set, loading successive portions reaches every match exactly once.
- A user who owns a comment but has lost write access cannot edit it. A deactivated
  author's name remains visible to users authorized to read the project.
- Board status changes remain operable through a keyboard status control;
  permission, validation, and conflict messages can be read without relying on color.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require an authenticated, approved, active company
  user before reading or changing company records through either channel.
- **FR-002**: Administrators MUST be able to approve, view, update, activate, and
  disable company accounts with a display name of 1–100 characters and a unique
  email address. Public self-registration MUST be unavailable.
- **FR-003**: The system MUST enforce the three-role access matrix below.
  Administrator is a company-wide role; Member and Viewer are project membership
  roles. Non-Administrators without membership MUST have no access to that project.
- **FR-004**: Administrators MUST be able to grant, change, and remove project
  memberships and grant or revoke Administrator status. A user's role in one
  project MUST NOT grant access to another project.
- **FR-005**: Account, membership, and role changes MUST take effect on the next
  attempted read or write in both channels. When a user loses assignee eligibility,
  current assignments MUST be cleared and historical attribution retained.
- **FR-006**: The system MUST reject any action that would leave the company with
  no active Administrator.
- **FR-007**: Administrators MUST be able to create projects with a name of 1–100
  characters, a key of 2–10 uppercase letters or digits starting with a letter,
  and an optional plain-text description of up to 2,000 characters.
- **FR-008**: Project keys MUST be unique ignoring letter case, normalized to
  uppercase, and immutable after creation. Names and descriptions MUST be editable.
- **FR-009**: Authorized users MUST be able to list active projects and explicitly
  include archived projects. Administrators MUST be able to archive and restore
  projects without deleting their content or memberships. Archived project content
  MUST be read-only, while administrative membership changes remain permitted.
- **FR-010**: Administrators and project Members MUST be able to create and edit
  issues in active projects. Each issue MUST belong to exactly one project.
- **FR-011**: Issues MUST have a nonblank title of 1–200 characters, an optional
  plain-text description of up to 10,000 characters, type Task or Bug, priority
  Low, Medium, or High, and status To Do, In Progress, or Done. Defaults MUST be
  Task, Medium, To Do, and unassigned.
- **FR-012**: Each issue MUST receive a permanent, unique identifier formed from
  its project key and issue number, its actual creator as immutable reporter,
  and creation and modification times. Its project and identifier MUST be immutable.
- **FR-013**: Each issue MUST have at most one assignee. Authorized writers MUST
  be able to assign, reassign, or clear assignment. Only active Administrators and
  active Members of that project MUST be eligible; selectable assignees MUST
  expose only display name and identifier, not account administration details.
- **FR-014**: Users MUST be able to find issues across their accessible projects
  by exact issue identifier or case-insensitive title substring, filter by project,
  status, priority, type, and assignee, and view My Issues. Supplied filters MUST
  combine as intersections; unassigned MUST be an assignee-filter option.
- **FR-015**: Each project MUST have one board with fixed To Do, In Progress, and
  Done columns. Each card MUST show issue identifier, title, priority, and assignee
  or Unassigned, and permit opening the corresponding issue.
- **FR-016**: Authorized writers MUST be able to move an issue between any two
  board statuses, including reopening Done issues, through pointer dragging or a
  keyboard-operable status control. A move MUST update the same status shown in
  issue details and MUST report an unsuccessful save without retaining a false
  successful state.
- **FR-017**: Boards MUST support the applicable issue search and filters from
  FR-014 within the current project, show full matching counts per column, and
  load each column in bounded portions.
- **FR-018**: Issue lists and board columns MUST order issues by most recently
  modified first with issue identifier as a stable tie-breaker. Manual card ranking
  MUST NOT be part of this MVP.
- **FR-019**: Authorized writers MUST be able to add nonblank plain-text comments
  of 1–5,000 characters to an issue in an active project.
- **FR-020**: Each comment MUST retain its actual author and original creation
  time. Only its author with current write access MUST be able to edit its text;
  edited comments MUST show an edited indicator and last-edit time.
- **FR-021**: Authorized readers MUST be able to read comments oldest first, with
  comment identifier as a stable tie-breaker, and load the complete discussion
  through bounded pages.
- **FR-022**: All project, issue, comment, membership, account, eligible-assignee,
  and activity-history lists, including board columns, MUST return at most 100
  records per portion, with 25 as the default requested size.
  Full counts MUST respect the same access checks and filters as their records.
  An unchanged result set MUST have no omissions or duplicates across portions.
- **FR-023**: Both access channels MUST reject missing or blank required fields,
  invalid or oversized values, and disallowed fields with understandable reasons
  and no partial changes. A
  rejected change MUST preserve the previously saved state.
- **FR-024**: Stale updates to issues, comments, projects, memberships, or accounts
  MUST be rejected with a conflict outcome and current authorized state for review.
  No channel MUST silently overwrite a newer revision.
- **FR-025**: Mutation commands in both channels MUST support a caller-supplied
  retry reference retained for at least 24 hours. Repeating the same command and
  reference for the same caller MUST return the original result without repeating
  its effects; reusing a reference with different input MUST be rejected.
  Current access checks MUST apply before returning a previous result.
- **FR-026**: The system MUST retain saved projects, issues, comments, memberships,
  and account state across reloads, sign-outs, and service restarts.
- **FR-027**: Every successful change MUST produce a retained activity record with
  actor, action, affected record, time, originating channel, and relevant field
  changes. Administrators MUST be able to inspect this history through either
  channel, filtered by affected record and ordered by time with a stable identifier
  tie-breaker. History MUST retain attribution after account or membership changes.
- **FR-028**: The web app MUST provide project selection, project issue lists, My
  Issues, a board, issue details with discussion, and administrative project and
  access management. Available controls MUST reflect the current user's permissions.
- **FR-029**: Core web flows MUST be usable with keyboard controls and clear field
  labels, visible focus, and readable validation, permission, and conflict messages.
  Core flows MUST work on desktop and tablet browser viewports of 768 pixels or wider.
- **FR-030**: MCP MUST expose the read and write actions in the role matrix,
  including project and account administration, board reads, issue search,
  assignment, comments, and activity history. Each operation MUST declare inputs,
  result fields, failure outcomes, and applicable retry and conflict behavior.
- **FR-031**: MCP actions MUST use the authenticated user's identity, never an
  identity supplied as an action's purported caller. An assistant MUST receive no
  permissions beyond that user's current account and project permissions.
- **FR-032**: The web app and MCP MUST operate on the same records and enforce
  identical field validation, role checks, ownership rules, statuses, assignment
  eligibility, archival rules, retry rules, and conflict outcomes.
- **FR-033**: Successful changes MUST be visible in the other channel on its next
  read. Continuous live synchronization MUST NOT be required for the MVP.
- **FR-034**: Unauthenticated, unauthorized, inactive, unavailable-record,
  validation, conflict, and temporary-failure outcomes MUST be distinguishable
  where permitted, with a next action when one is possible. Unknown and
  inaccessible records MUST share one unavailable-record outcome.
- **FR-035**: The system MUST provide clear empty states and MUST display supplied
  project, issue, and comment text as plain text without executing embedded content.
- **FR-036**: The MVP MUST retain its records and history without user-facing
  permanent deletion of accounts, projects, issues, or comments.

### Role and Access Matrix

A company Administrator can access every project without a separate membership.
A non-Administrator has either Member or Viewer membership per project. Granting
Administrator status preserves existing memberships; those memberships determine
project access again if Administrator status is later revoked. All
permissions below require an active approved account; content writes additionally
require an active project. Comment ownership still applies to Administrators.

| Action | Administrator | Project Member | Project Viewer |
| --- | --- | --- | --- |
| Read project, issues, board, comments, and eligible assignees | All projects | Joined projects | Joined projects |
| Create or edit issues, assign work, and change status | Yes | Yes | No |
| Add comments and edit own comments | Yes | Yes | No |
| Edit another person's comment | No | No | No |
| Create, edit, archive, or restore projects | Yes | No | No |
| Approve or manage company accounts and Administrator status | Yes | No | No |
| Grant, change, or remove project membership | Yes | No | No |
| Inspect activity history | Yes | No | No |

### MVP Scope Boundaries

The MVP includes the six stories, the fixed role matrix, basic search and filters,
persistent history, and both access channels. Attachments, rich-text editing,
notifications, sprints, epics, subtasks, custom fields, custom workflows, manual
card ranking, cross-project issue moves, permanent deletion, imports from Jira,
third-party business integrations, public guest access, multiple companies, and
native mobile applications are outside this release.

### Key Entities *(include if feature involves data)*

- **Company User**: Approved employee identity, unique email, display name,
  active/inactive state, and whether they hold company Administrator status.
- **Project**: Named work area with permanent key, optional description, active or
  archived state, and associated issues and memberships.
- **Project Membership**: Relationship between a user and a project with exactly
  one Member or Viewer role; company Administrator permissions take precedence
  while that status is active.
- **Issue**: Project work item with permanent identifier, title, description,
  type, priority, status, reporter, optional assignee, timestamps, and revision.
- **Kanban Board**: The project's issue view grouped into the three fixed statuses,
  with filters, matching counts, and incrementally loaded cards.
- **Comment**: Plain-text discussion entry attached to one issue, with permanent
  author, creation time, optional last-edit time, and revision.
- **Activity Record**: Retained account, membership, project, issue, or comment
  change attributable to a user, a time, and a web or MCP action.
- **Retry Reference**: A caller's identifier for one intended mutation, used to
  recognize repetitions of that action without confusing them with new work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of at least 10 representative employees, using prepared
  accounts and a short orientation, can create an issue, assign it, comment, and
  move it to Done in the web app within five minutes without assistance.
- **SC-002**: Every action and denial in the role matrix passes acceptance checks
  through both channels, including cross-project attempts, account deactivation,
  membership removal, last-Administrator protection, and comment ownership, with
  zero unauthorized records disclosed or changed.
- **SC-003**: At the assumed MVP workload, at least 95% of project-list, issue-detail,
  search, board-opening, and confirmed-edit actions complete within two seconds
  from submission to displayed result once the service is active. The first
  project-list or board-opening action after an idle period completes within five
  seconds in at least 95% of measured trials; active and idle-start trials are
  reported separately.
- **SC-004**: In at least 20 complete assistant-driven work sessions, an authorized
  user can find a project, create an issue, assign it, move it, and comment through
  MCP without entering those changes in the web app. In every session, the next
  web read shows the same identifiers, status, assignee, and comments.
- **SC-005**: Repeating each mutation with the same valid retry reference within
  24 hours produces exactly one set of effects and their corresponding activity
  records, without duplicates, in every acceptance case. Every tested stale
  update is rejected without losing the newer change, and saved work remains
  after reopening either channel and after restart.
- **SC-006**: At the assumed dataset size, traversing an unchanged filtered list,
  board column, or discussion retrieves every authorized match exactly once;
  initial views do not require loading the entire dataset.
- **SC-007**: Every core web flow in FR-028 can be completed using keyboard input
  alone at desktop and tablet widths. Status changes, failures, and required
  actions remain understandable without color-only indicators.

## Assumptions

- **Company model**: One company owns this installation. Multi-company separation
  and subscription billing are outside the MVP.
- **Access defaults**: The company owner provisions the initial approved
  Administrator before employee onboarding. Subsequent accounts require approval;
  public registration and anonymous access to company work are unavailable.
- **Roles and workflow defaults**: Three roles, Task/Bug issue types, three
  priorities, and three statuses are deliberate MVP defaults. Any issue may move
  between any statuses; no approval gates or required assignee are imposed.
- **MVP workload**: The initial planning and performance baseline is 50 concurrent
  active users, 20 projects, 10,000 issues total with up to 2,000 in one project,
  and 20,000 comments total with up to 500 on one issue. These are planning
  assumptions, not measured current company usage; revisit them before planning
  if the company's expected workload differs.
- **Performance measurement**: Use a supported current desktop browser on an
  ordinary company laptop, a stable connection of at least 10 Mbps and no more
  than 100 ms round-trip latency to the hosting region, and at least 100 trials
  per measured action under the baseline workload. An idle-start trial begins
  after the service has been idle for 30 minutes. Measure from submitting a web
  action to its displayed confirmed result; assistant thinking time is outside
  these web measurements.
- **Client scope**: The web app targets modern desktop and tablet browsers.
  A compatible MCP client is available to demonstrate assistant workflows;
  building an assistant or model provider is outside the MVP.
- **Dependencies**: The company must provide approved-user identities, the initial
  Administrator, a hosting account, and a compatible MCP client. Planning must
  choose the sign-in integration and operational setup within the ratified
  project constitution; no existing identity service is assumed.
- **Retention and edits**: Archival and account disabling preserve work history.
  Record history is retained for the life of this installation in the MVP.
  Offline edits, permanent deletion, and comment moderation are outside scope.
- **Scope of this artifact**: The ratified constitution supplies the requested
  stack, separation of frontend and backend, typing, performance, simplicity, and
  hosting rules. This specification defines observable business behavior; the
  next planning step applies those architecture constraints.
