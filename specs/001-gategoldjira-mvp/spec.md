# Feature Specification: GateGoldJira MVP

**Feature Branch**: Not created; Git branching is not configured.

**Feature Directory**: specs/001-gategoldjira-mvp

**Created**: 2026-10-11

**Updated**: 2026-10-12

**Status**: Draft — requirements quality review passed; implementation plan and feature-first task list complete, ready for cross-artifact analysis.

**Input**: User description: "Create the MVP spec for GateGoldJira with projects, issues, assignments, kanban boards, comments and user roles, with web app and MCP access. Add board creation, drag-and-drop, HTML comments, pictures, Arabic comments, and blocked-by dependencies on another developer’s issue. Include mentions and notifications, due dates and labels, subtasks, and a Review column with work-in-progress warnings."

GateGoldJira gives one company a shared place to organize projects, assign work,
track progress, and discuss issues. Employees can work in the web app or through
an authorized MCP-connected assistant. Both channels act on the same company
records and enforce the same permissions. Named Kanban boards provide shared
views of project work. Rich-text HTML comments support pictures and Arabic, and
issue dependencies make it clear which developer's work must be finished first.
Due dates, labels, and subtasks organize delivery; mentions and an in-app inbox
keep people informed. A Review stage and configurable work-in-progress warnings
make handoffs and overloaded columns visible.

All ten user stories are required for the MVP. Priorities indicate delivery order,
not optional scope. Independent tests may use prepared users, projects, and issues
as fixtures without requiring the other stories' interfaces.

## Local development sign-in addendum (2026-10-12)

The user requested username/password sign-in and a generated account for the
running local application. **DEV-AUTH-001** requires a labeled Username and
Password form instead of manually pasting an expiring token. Local setup generates
private random credentials for the existing Owner, Member, Viewer and Disabled
fixtures without changing existing credentials on a repeated run. Correct
credentials sign in an approved active account; unknown usernames, wrong passwords
and disabled accounts cannot reach company data. A subsequent sign-in creates a
fresh short-lived session without requiring the user to regenerate a token.

The development server verifies password hashes, then uses the same signed-identity
and current account/project authorization as other requests. Plaintext generated
credentials stay in ignored private local files; the browser does not persist
passwords or access tokens. Sign-out and reload clear protected session state.
This fixture-only mechanism is unavailable in production and Cloud Run. The
planned managed Auth0/Google login and delegated MCP OAuth remain production
requirements. No public self-registration or password administration is added.

Acceptance: sign in as Owner, Member and Viewer with their generated credentials;
reject wrong credentials and the Disabled fixture; sign out/reload and verify
protected data is cleared; retry sign-in successfully without refreshing a token
file. Check that production configuration cannot enable this fixture endpoint.

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
   default All Issues Kanban board and can receive members; invalid fields produce clear field errors.
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

### User Story 4 - Create and Use Kanban Boards (Priority: P1)

As a Member, I create named boards for useful views of project work, arrange cards
by importance, and move issues as work progresses.

**Why this priority**: A usable Kanban board and the ability to create boards are
explicitly required for the company's everyday work.

**Independent Test**: With prepared project issues, create a named filtered board,
move and reorder cards, reopen it, and compare the same issues on the default board.

**Acceptance Scenarios**:

1. **Given** a project, **When** an authorized user opens its default All Issues
   board, **Then** To Do, In Progress, Review, and Done columns show corresponding cards
   with identifier, title, priority, assignee or Unassigned, due date and labels
   when present, and a Blocked badge when unfinished blocking issues exist.
   Subtask cards show their parent identifier; parent cards show subtask progress.
2. **Given** a Member in an active project, **When** they create a named board with
   a saved assignee, type, priority, status, blocked-state, or title filter,
   **Then** it appears in that project's board list for authorized readers and
   shows matching existing issues without creating copies.
3. **Given** an issue without unfinished blockers, **When** a writer drags it
   between columns or uses the keyboard status control, **Then** its saved status
   agrees with every board and its issue details. Dragging within a column or
   using keyboard Move Before/After controls saves its order across that
   project's boards without changing its status. Review is a saved status;
   moves into and out of it preserve the same permissions and dependency checks.
4. **Given** a filtered board with more matches than one page, **When** a user
   loads more cards in a column, **Then** additional matching cards appear without
   duplicates or omissions for an unchanged set, and the column count reflects
   all matching cards. Reordering visible cards preserves the relative order of
   cards not moved, including currently hidden cards.
5. **Given** a custom board, **When** its creator with current Member access edits
   its name or saved filters, **Then** the view changes without changing any issue.
   Another Member cannot change those settings; an Administrator can manage any board.
6. **Given** a custom board, **When** its eligible creator or an Administrator
   archives and later restores it, **Then** its saved view is preserved and no
   issue or comment is archived or deleted. Archived boards are excluded from
   the default board list and cannot be used for moves until restored. The default
   All Issues board cannot be archived or have its all-issues scope changed.
7. **Given** a failed, blocked, or conflicting move or reorder, **When** the result
   is shown, **Then** the board represents the last confirmed state and explains
   why the action was not saved. Viewers and archived-project users cannot save
   moves, reorder cards, or create boards.
8. **Given** an issue edited through a filtered board, **When** its new values no
   longer match that board, **Then** it leaves that view with a clear explanation
   and remains accessible through its issue details and the default board.
9. **Given** a board with an In Progress warning limit of two and two matching
   issues already there, **When** a writer moves a third issue into that column,
   **Then** the permitted move succeeds and the column shows "3 / 2 — limit
   exceeded" in text. Returning the count to two clears the warning; an equivalent
   MCP board read reports the count, limit, and warning.
10. **Given** a board with a saved filter and a configured warning limit, **When**
    a reader applies a temporary filter or only one card page is loaded, **Then**
    the warning still uses every issue matching the board's saved filter in that
    column, including parent issues and subtasks, rather than the visible subset.
11. **Given** a custom-board creator with current write access or an Administrator,
    **When** they configure or clear the In Progress or Review warning limit,
    **Then** it persists through either channel. Other users cannot change it,
    and only an Administrator can configure the default board's limits.

---

### User Story 5 - Coordinate Work with Blocked-By Dependencies (Priority: P1)

As a developer, I link my issue to another developer's blocking issue so everyone
can see what work must finish before my issue can be completed.

**Why this priority**: Dependencies prevent the team from treating unfinished
prerequisite work as completed and make responsibility for blockers visible.

**Independent Test**: With two issues assigned to different developers in one
project, make A blocked by B, attempt to complete A, complete B, and then complete A.

**Acceptance Scenarios**:

1. **Given** two issues in the same active project, **When** a writer adds "A is
   blocked by B," **Then** A shows B under Blocked By and B shows A under Blocks,
   including each linked issue's identifier, title, status, and assignee.
2. **Given** A has one or more linked blockers not Done, **When** a user reads A
   or its board card, **Then** it is marked Blocked and the blocking issue and
   responsible developer can be inspected. Blocked is independent of A's workflow
   column and can be used as a filter.
3. **Given** A is blocked, **When** a user tries to move it to Done from a board,
   issue details, or MCP, **Then** the move is rejected without changing A and
   the unfinished blocking issues are identified. Moving it to In Progress for
   preparatory work or Review remains allowed with its Blocked indication.
4. **Given** A has multiple blockers, **When** some but not all are completed,
   **Then** A remains blocked. Once all blockers are Done, its next read shows it
   unblocked and it may move to Done; no automatic status change is made to A.
5. **Given** dependency links, **When** a writer tries to link an issue to itself,
   create a completion-prerequisite cycle including parent/subtask relationships,
   link across projects, or repeat an existing link,
   **Then** invalid relationships are rejected and a duplicate returns the
   existing relationship without duplicating it.
6. **Given** a dependency, **When** a writer removes it, **Then** both directions
   disappear and blocked state is recalculated. Reopening a blocker restores the
   dependent issue's Blocked indication; an already Done dependent keeps its
   status and shows that its dependency has reopened.
7. **Given** a Done issue, **When** a writer tries to add an unfinished blocker,
   **Then** they are asked to reopen that issue first. Viewers, revoked users, and
   users in archived projects cannot add or remove dependency links.

---

### User Story 6 - Work Through an MCP-Connected Assistant (Priority: P1)

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
   **Then** the returned records, filters, board order, blocked state, and permissions
   match the web app.
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
7. **Given** an authorized Member, **When** their assistant creates a board,
   reorders cards, links blocking issues, uploads a picture, or posts formatted
   Arabic HTML containing that picture, **Then** the same ownership, dependency,
   picture, formatting, and language rules apply, and the saved results can be
   read in the web app. A client that cannot render HTML can read a plain-text
   equivalent, picture descriptions, and authorized picture references.
8. **Given** an authorized user and prepared inbox entries, **When** their
   assistant sets a due date and labels, creates or completes a subtask, moves
   an issue through Review, posts a selected-user mention, reads their inbox,
   marks notifications read, or configures an owned board's warning limit,
   **Then** the same dates, relationships, recipients, privacy, and warning rules
   apply as in the web app. Notification recipients are determined by the saved
   action, not by an arbitrary recipient override in the request.

---

### User Story 7 - Discuss Work with HTML, Pictures, and Arabic (Priority: P2)

As a Member, I write formatted comments in Arabic, English, or both and include
screenshots or pictures so the team can understand and discuss the work clearly.

**Why this priority**: Rich comments and pictures capture context that plain
text cannot, while Arabic support is required for the company's communication.

**Independent Test**: With a prepared issue, write a bilingual formatted comment,
upload a screenshot, save and reopen it through each channel, and test ownership
and picture access with a Viewer and a user outside the project.

**Acceptance Scenarios**:

1. **Given** a writable issue, **When** a Member uses the comment editor to add
   paragraphs, headings, bold, italic, underline, lists, quotes, or web links,
   **Then** the supported HTML formatting is saved with author and creation time
   and appears when the issue is reopened.
2. **Given** their own comment in a writable project, **When** its author edits
   text, formatting, or picture placement, **Then** the new content and an edited
   indicator appear while original authorship and creation time remain. Other
   users cannot edit it, and removed picture references remain in retained history.
3. **Given** a Viewer and a discussion longer than one page, **When** they read
   comments and load more, **Then** they can read the full authorized discussion
   and its pictures but cannot post, upload, or edit.
4. **Given** an empty-looking HTML comment, oversized content, a repeated retry,
   or a stale edit, **When** it is submitted, **Then** content without nonblank
   text or a valid picture is rejected, successful adds are not duplicated on
   retry, and stale edits cannot overwrite newer edits.
5. **Given** Arabic or mixed Arabic/English text such as "المهمة تحتاج تعديل GGJ-12",
   **When** it is entered, saved, edited, copied, and read through either channel,
   **Then** its Unicode text, punctuation, and numbers are preserved; Arabic
   paragraphs display right to left and English identifiers remain readable.
6. **Given** pasted HTML with unsupported formatting or executable content,
   **When** it is prepared for saving, **Then** unsupported content is removed
   with a notice, supported formatting remains, no executable content runs, and
   the displayed safe result agrees across both channels.
7. **Given** a writable issue, **When** a Member uploads, pastes, or drops a valid
   picture into the comment composer and adds its description, **Then** a preview
   appears and saving the comment places the picture inline. A picture-only
   comment with a valid picture and description is permitted.
8. **Given** an issue picture, **When** a project reader opens or downloads it,
   **Then** it is available; an outsider or a user whose access was revoked cannot
   obtain it through a copied reference or MCP request.
9. **Given** a writable issue, **When** a Member adds a picture directly to the
   issue, **Then** it appears in that issue's picture gallery with uploader,
   filename, description, and upload time and remains available after reopening
   the issue and restarting the service.
10. **Given** an unsupported or oversized picture, or an interrupted upload,
    **When** it is added, **Then** the user receives a clear failure, their comment
    draft remains available, and no saved comment contains a broken picture
    reference. Unpublished comment pictures are visible only to their uploader.

### User Story 8 - Organize Work with Due Dates and Labels (Priority: P2)

As a Member, I set deadlines and reusable project labels so the team can find
related work and identify overdue items.

**Why this priority**: Dates and labels improve everyday planning without adding
a separate scheduling or reporting system.

**Independent Test**: With prepared issues and users, set and clear dates, add and
remove labels, find matching work through each channel, and check overdue behavior
on either side of a company-calendar date boundary.

**Acceptance Scenarios**:

1. **Given** an issue or subtask in an active project, **When** a writer sets,
   changes, or clears its optional due date, **Then** the calendar date persists
   without shifting across browser time zones; an impossible date is rejected.
2. **Given** a due date before today's company-calendar date, **When** the issue
   is not Done, **Then** its details and board card show Overdue. A due date today
   is not overdue, and a Done issue is not marked overdue.
3. **Given** a writable issue, **When** a writer selects existing labels or creates
   a nonblank new label, **Then** up to ten project labels can be attached. A name
   differing only by letter case reuses the same label, and Arabic labels keep
   their text. Removing a label from one issue does not remove it from other issues.
4. **Given** dated and labeled issues, **When** a reader combines label, due-date
   range, overdue, status, and assignee filters, **Then** only accessible matches
   are returned in both issue lists and saved board views.
5. **Given** a Viewer or archived project, **When** dates or labels are changed,
   **Then** the change is rejected while authorized reading and filtering remain
   available. Exceeding label or field limits rejects the whole attempted change.
6. **Given** inclusive date boundaries, undated issues, and multiple selected
   labels, **When** filters are applied, **Then** both boundary dates match, all
   selected labels are required, undated work is excluded from date ranges but
   included in not-overdue results, and reversed ranges are rejected.

---

### User Story 9 - Split Work into Subtasks (Priority: P2)

As a Member, I split an issue into smaller assigned subtasks and see their
progress so different developers can contribute to the same piece of work.

**Why this priority**: Subtasks support shared delivery while keeping the work
hierarchy to one level.

**Independent Test**: With a prepared parent issue and two developers, create
subtasks, give them separate assignments and statuses, find them on the board,
and complete the parent only after its subtasks and blockers are finished.

**Acceptance Scenarios**:

1. **Given** a non-Done Task or Bug in an active project, **When** a writer creates
   a subtask with a title, **Then** it receives its own permanent issue identifier,
   Subtask type, To Do status, Medium priority, no assignee, and exactly that
   parent in the same project.
2. **Given** a subtask, **When** a writer sets its assignee, due date, labels,
   priority, description, status, comments, pictures, or blocked-by links,
   **Then** it behaves as an independent work item under the same project
   permissions; its parent identifier remains available for navigation.
3. **Given** a parent with three subtasks and two Done, **When** a reader opens
   it or its board card, **Then** progress is shown as "2 of 3 subtasks Done."
   Board filters and My Issues can find an assigned subtask independently.
4. **Given** a parent with unfinished subtasks or unfinished direct blockers,
   **When** anyone tries to move the parent to Done, **Then** it is rejected with
   the unfinished work identified. After all are Done, the parent may be completed
   explicitly; completing the last subtask does not automatically complete it.
5. **Given** a Subtask or an existing parent relationship, **When** someone tries
   to nest another subtask below it, change its parent or project, or convert it
   between Subtask and Task/Bug types, **Then** the change is rejected. A dependency on its own parent
   that would make completion impossible is rejected as a prerequisite cycle.
6. **Given** a Done parent, **When** someone creates a new subtask or reopens a
   completed subtask, **Then** the parent must be explicitly reopened first.
   Stale and repeated commands obey the ordinary conflict and retry rules.

---

### User Story 10 - Mention People and Receive Notifications (Priority: P2)

As an employee, I mention a teammate when their attention is needed and read a
personal in-app inbox so I know about assignments, discussion, and changes that
affect my work.

**Why this priority**: Notifications make the requested collaboration features
useful without requiring the team to repeatedly inspect every issue.

**Independent Test**: With a prepared project, reporter, assignee, mentioned
Viewer, and unrelated user, post a mention, change work, and verify exactly the
expected personal inbox entries through both channels.

**Acceptance Scenarios**:

1. **Given** a writable comment, **When** its author types @ and selects an
   eligible active project reader, **Then** the saved comment contains a
   recognizable mention linked to that user's identity and that user receives
   a notification. An unselected @name stays ordinary text without notification.
2. **Given** a comment mentioning an assignee who is also its reporter, **When**
   the comment is saved or the same command is retried, **Then** that person gets
   one notification for that saved event with all applicable reasons, not one
   per role or retry. The author receives no notification for their own action.
3. **Given** an edited comment with existing mentions, **When** its author adds
   a new mentioned user, **Then** only newly added mentions are notified; unchanged
   mentions are not notified again. Inactive and unrelated users cannot be selected
   for a new mention, but historical mentions can remain in the edited comment.
4. **Given** an assignment, posted comment, status or due-date change, blocked
   state change, new subtask, or completion of all subtasks, **When** it is saved,
   **Then** recipients follow the Notification Rules table and the corresponding
   inbox entries are available on the next read. Failed changes produce none.
5. **Given** an active user, **When** they open their inbox, filter unread entries,
   open a notification, mark individual entries read or unread, or mark all
   currently accessible entries read,
   **Then** the newest-first list, unread count, and saved read state reflect
   only their own currently accessible notifications across both channels.
6. **Given** a notification for a project whose access is revoked, **When** the
   former reader requests their inbox, unread count, or that entry directly,
   **Then** it exposes no project text, identifiers, pictures, or message content.
   An Administrator cannot open another user's inbox through role authority alone.
7. **Given** an Arabic or bilingual mention and notification summary, **When** it
   is saved and read through either channel, **Then** its text and readable
   direction remain preserved and its issue reference opens only with current access.

### Edge Cases

- Empty project lists, boards, search results, and discussions show an understandable
  empty state and the next permitted action; a read-only user is not offered a write action.
- A title or project name containing only whitespace is invalid. A comment made
  only of empty HTML, whitespace, or unsupported content is invalid unless it
  contains a valid uploaded picture. Project and issue text remains plain text;
  supported comment HTML is formatted without executing embedded content.
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
- A stale card move or reorder, issue edit, comment edit, board-setting edit,
  dependency change, or administrative change cannot
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
- Dragging in a filtered board changes an issue's status or shared order, not its
  project or other fields. A filter change can hide cards without deleting them.
- Board creators who lose write access cannot manage their boards. Their boards
  stay available to project readers, and an Administrator can manage them.
- A dependency cannot be self-referential, cyclic, duplicated, or across projects.
  Cycle checks include mandatory parent/subtask completion relationships.
  Removing or completing one of several blockers does not unblock the issue
  while another blocker remains unfinished.
- Reopening a blocker restores the dependent's warning on its next read. Existing
  completed work is not silently reopened; the team can explicitly reopen it.
- Arabic paragraphs, English identifiers, mixed punctuation, numbers, and picture
  descriptions retain their text and intended direction after rich-text edits.
- HTML links or pictures cannot run embedded code. Inline pictures must refer to
  authorized pictures uploaded to that same issue; arbitrary remote images and
  embedded picture data in comment HTML are not supported.
- Revoking project access also revokes access to its pictures. Unpublished comment
  pictures stay private to their uploader and expire after 24 hours without publication.
- A picture upload is not a saved comment. An interrupted upload can be retried
  without posting a duplicate comment or losing the user's unsent text.
- WIP warnings count the complete saved board view, including subtasks. Temporary
  filters, collapsed columns, and incremental loading cannot hide an exceeded
  limit. Equal-to-limit counts are permitted without an exceeded warning.
- A due date is a calendar date, not a timestamp. Today is not overdue; a reopened
  issue with a past due date becomes overdue. Invalid dates and reversed date
  ranges are rejected rather than silently corrected.
- Labels are project-scoped. Duplicate names ignoring case reuse the existing
  label; removing a label from an issue preserves its use elsewhere.
- A parent cannot finish before its subtasks, and a child cannot become a parent.
  Completed parents must be reopened before adding or reopening unfinished child
  work. Parent completion rules and explicit blocker links cannot form a cycle.
- Concurrent parent completion and child creation or reopening cannot leave a
  Done parent with an unfinished subtask; one conflicting action must be rejected.
- An edited comment only notifies newly added mentions. Multiple recipient roles
  for one saved event yield one inbox entry; retries and failed actions yield no
  duplicate or false notifications.
- Notification delivery and reads respect current account and project access.
  Hidden entries contribute nothing to unread counts, and copied notification
  references cannot open another person's inbox.
- Notifications remain available through sign-out and restart. Read/unread
  changes affect only the recipient's personal inbox and do not change issue state.

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
  plain-text or explicitly formatted HTML description of up to 10,000 stored characters,
  type Task, Bug, or Subtask, priority Low, Medium, or High, and a starting or custom
  saved stage in a typed To Do, In Progress, Review or Completed category.
  Ordinary issue defaults MUST be Task, Medium, To Do, and unassigned. Subtask
  creation MUST set Subtask type and otherwise use those same defaults.

- **FR-012**: Each issue MUST receive a permanent, unique identifier formed from
  its project key and issue number, its actual creator as immutable reporter,
  and creation and modification times. Its project and identifier MUST be immutable.
- **FR-013**: Each issue MUST have at most one assignee. Authorized writers MUST
  be able to assign, reassign, or clear assignment. Only active Administrators and
  active Members of that project MUST be eligible; selectable assignees MUST
  expose only display name and identifier, not account administration details.
- **FR-014**: Users MUST be able to find issues across their accessible projects
  by exact issue identifier, case-insensitive project-key prefix, or title substring, filter by project,
  status, priority, type, assignee, parent, labels, due-date range, and overdue
  state, and view My Issues including subtasks. Supplied filters MUST combine as
  intersections; unassigned MUST be an assignee-filter option.

- **FR-015**: Each project MUST have a default All Issues Kanban board and support
  additional named Kanban boards, starting with To Do, In Progress, Review and Done and supporting custom saved
  stages without a fixed count. Authorized board managers can add stages, rename/reorder
  columns and configure allowed moves as defined in FLOW-001–FLOW-004.
  Cards MUST show identifier, title, priority, assignee or Unassigned,
  blocked indication, due date and overdue state when applicable, and labels.
  Subtask cards MUST identify their parent; parent cards MUST show subtask progress.
  Each card MUST permit opening the corresponding issue.

- **FR-016**: Authorized writers MUST be able to move issues between workflow
  columns, subject to the current board's allowed moves, blocked-by and subtask completion rules, through pointer
  dragging or keyboard-operable status controls. They MUST also be able to reorder
  cards within a column using dragging or keyboard Move Before/After controls.
  WIP warnings MUST NOT reject otherwise permitted moves. A move MUST agree with
  issue details and MUST NOT retain a false saved state on failure.

- **FR-017**: Boards MUST support the applicable issue search and filters from
  FR-014 within the current project, plus blocked/unblocked filtering, show full
  matching counts per column, and load each column in bounded portions.
  Saved board filters and temporary viewing filters MUST combine as intersections.
- **FR-018**: Board columns MUST persist a manual issue order shared across all
  boards in that project, with issue identifier as a stable tie-breaker. New
  issues and issues moved into another status MUST appear at that column's end.
  Reordering MUST preserve the relative order of issues not moved, including
  filtered-out issues. Ordinary issue lists MUST remain most-recently-modified first.
- **FR-019**: Authorized writers MUST be able to add rich-text HTML comments to
  issues in active projects. A comment MUST contain nonblank text or at least one
  valid inline picture, with at most 5,000 visible text characters, five inline
  pictures, and 64 KiB of formatted content excluding picture file bytes.
- **FR-020**: Each comment MUST retain its actual author and original creation
  time. Only its author with current write access MUST be able to edit its text,
  formatting, or inline picture references. Edited comments MUST show an edited
  indicator and last-edit time; replaced content and pictures MUST remain in history.
- **FR-021**: Authorized readers MUST be able to read comments oldest first, with
  comment identifier as a stable tie-breaker, and load the complete discussion
  through bounded pages.
- **FR-022**: All project, board, issue, subtask, comment, picture, dependency,
  label, notification, membership, account, eligible-assignee, mention-candidate,
  and activity-history lists, including board columns, MUST return at most 100
  records per portion, with 25 as the default requested size. Counts MUST respect
  the same access checks and filters as their records. An unchanged result set
  MUST have no omissions or duplicates across portions.

- **FR-023**: Both access channels MUST reject missing or blank required fields,
  invalid or oversized values, and disallowed fields with understandable reasons
  and no partial changes. A rejected change MUST preserve the previously saved state.
- **FR-024**: Stale updates to issues, comments, projects, board settings, card
  order, dependencies, memberships, or accounts MUST be rejected with a conflict
  outcome and current authorized state for review.
  No channel MUST silently overwrite a newer revision.
- **FR-025**: Mutation commands in both channels MUST support a caller-supplied
  retry reference retained for at least 24 hours. Repeating the same command and
  reference for the same caller MUST return the original result without repeating
  its effects; reusing a reference with different input MUST be rejected.
  Current access checks MUST apply before returning a previous result.
- **FR-026**: The system MUST retain saved projects, boards and their WIP limits,
  card order, issues and subtasks, due dates, labels, dependency links, rich comments,
  pictures, notifications and their read state, memberships, and account state
  across reloads, sign-outs, and service restarts.

- **FR-027**: Every successful change MUST produce a retained activity record with
  actor, action, affected record, time, originating channel, and relevant field
  changes. Administrators MUST be able to inspect company history through either
  channel, filtered by affected record and ordered by time with a stable identifier
  tie-breaker. History MUST retain attribution after account or membership changes.
  Audit entries for personal notification read-state changes MUST retain required
  actor/action/record/time metadata without exposing message content or providing
  access to another user's inbox.

- **FR-028**: The web app MUST provide project and board selection, board creation
  and management with WIP limits, issue lists and My Issues with date and label
  filters, drag-and-drop Kanban including Review, issue details with due dates,
  labels, subtasks, dependency links and pictures, rich discussion with mentions,
  a personal notification inbox, and administrative project and access management.
  Available controls MUST reflect the current user's permissions.

- **FR-029**: Core web flows MUST be usable with keyboard controls and clear field
  labels, visible focus, and readable validation, permission, and conflict messages.
  Core flows MUST work on desktop and tablet browser viewports of 768 pixels or wider.
- **FR-030**: MCP MUST expose the read and write actions in the role matrix,
  including project and account administration, boards and WIP limits, card ordering,
  issue search and assignment, due dates and labels, subtask creation and progress,
  dependency linking, HTML comments with mentions, picture upload and retrieval,
  personal notification listing and read-state changes, and activity history.
  Each operation MUST declare inputs, result fields, failure outcomes, and applicable
  retry and conflict behavior. Arbitrary direct notification sending MUST NOT be
  an MVP action; notifications MUST follow the saved-work rules.

- **FR-031**: MCP actions MUST use the authenticated user's identity, never an
  identity supplied as an action's purported caller. An assistant MUST receive no
  permissions beyond that user's current account and project permissions.
- **FR-032**: The web app and MCP MUST operate on the same records and enforce
  identical validation, role checks, ownership, workflow statuses, assignments,
  board order and WIP warnings, due-date and label rules, parent/subtask completion
  and dependency rules, safe comment formatting, mention eligibility and notification
  privacy, picture access, Arabic preservation, archival rules, retries, and conflicts.

- **FR-033**: Successful changes MUST be visible in the other channel on its next
  read. Continuous live synchronization MUST NOT be required for the MVP.
- **FR-034**: Unauthenticated, unauthorized, inactive, unavailable-record,
  validation, conflict, and temporary-failure outcomes MUST be distinguishable
  where permitted, with a next action when one is possible. Unknown and
  inaccessible records MUST share one unavailable-record outcome.
- **FR-035**: The system MUST provide clear empty states. Project names,
  descriptions and issue titles MUST display as plain text. Issue descriptions MUST
  use their explicit plain/HTML format and sanitized typed rendering as defined in HTML-001–HTML-003.
  Comments MUST display only supported safe HTML formatting, and user content
  MUST NOT execute embedded content.
- **FR-036**: The MVP MUST retain its records and history without user-facing
  permanent deletion of accounts, projects, boards, issues, comments, or published
  pictures. Removing a dependency or current picture reference MUST preserve
  its history. Unpublished picture drafts may expire under FR-047.

- **FR-037**: Administrators and project Members MUST be able to create boards
  with a nonblank name of 1–100 characters, unique within their project ignoring
  letter case, and saved issue filters. Boards MUST be views of existing project
  issues, inherit project read permissions, and never copy issues or grant access
  beyond the project. Creating or editing a board MUST NOT change issue fields.
- **FR-038**: A custom board's creator with current project write access or an
  Administrator MUST be able to rename it, change its saved filters and WIP limits,
  archive it, and restore it. Other Members and Viewers MUST only be able to read
  and use it within their issue permissions. The default board's all-issues scope
  MUST remain fixed and it MUST NOT be independently archived; temporary filters
  MUST remain available, and only Administrators MAY configure its WIP limits.
  Archived custom boards MUST be read-only until restored without affecting
  underlying issue permissions.

- **FR-039**: Comment formatting MUST support paragraphs, headings, bold, italic,
  underline, bullet and numbered lists, quotations, line breaks, web links,
  validated user mentions, and uploaded inline pictures. Unsupported formatting
  and executable content MUST be removed before saving with a notice; only HTTP
  or HTTPS web-link destinations MUST be retained. The web editor MUST provide
  formatting and mention controls; MCP MUST accept and return supported HTML plus
  a readable plain-text equivalent preserving mention labels.

- **FR-040**: Authorized writers MUST be able to upload pictures directly to an
  issue's gallery or inline in comments. The web app MUST support file selection,
  clipboard paste, and file drop, with a preview and a nonblank picture description
  of 1–200 characters. Supported pictures MUST be PNG, JPEG, or WebP with a maximum
  file size of 10 MiB each; unsupported or misidentified files MUST be rejected.
- **FR-041**: Only users with current project read access MUST be able to view
  or download its published pictures through either channel. Every published
  picture MUST have a permanent identifier, filename, description, uploader,
  size, type, and upload time and remain readable after restart. Inline pictures
  MUST belong to the same issue as their comment; remote-image embedding and
  picture file bytes embedded directly in comment HTML MUST not be supported.
- **FR-042**: Arabic, English, and mixed-language comment text and picture
  descriptions MUST preserve their Unicode text through entry, save, edit, copy,
  and MCP access. Arabic paragraphs MUST support right-to-left presentation and
  English paragraphs left-to-right presentation, with a direction control when
  automatic direction needs correction. Mixed issue identifiers, numbers, links,
  and punctuation MUST remain readable.
- **FR-043**: Authorized writers MUST be able to add and remove a directed
  blocked-by link between two issues in the same active project, even when the
  issues have different assignees. Both issue views MUST show reciprocal
  Blocked By and Blocks entries with identifier, title, status, and assignee.
- **FR-044**: An issue MUST be marked Blocked when at least one directly linked
  blocking issue is not Done. This indication and unfinished-blocker count MUST
  appear on its issue view and board cards, support filtering, and reflect the
  current blocker statuses on the next read without changing its workflow status.
- **FR-045**: An issue with unfinished blockers MUST NOT move to Done through
  any channel. The rejection MUST identify the unfinished blockers. To Do,
  In Progress, and Review changes MUST remain available. Completing or removing
  every blocker MUST clear the blocked indication without automatically moving
  the dependent issue. Parent issues MUST also satisfy the subtask completion
  rule in FR-057 before moving to Done. Rejections MUST expose bounded unfinished
  prerequisite pages, with remaining portions available through the ordinary
  authorized issue search using the rejected issue as `prerequisiteFor`.

- **FR-046**: Dependency changes MUST reject self-links, cycles, and cross-project
  links; cycle checks MUST consider both explicit links and mandatory parent/subtask
  completion prerequisites. Adding an existing link MUST return it without
  duplication. Adding an unfinished blocker to a Done issue MUST be rejected until
  the dependent is reopened. Reopening an existing blocker MUST restore the Blocked
  indication without silently reopening a Done dependent, except that reopening
  a subtask of a Done parent first requires reopening its parent under FR-057.

- **FR-047**: Pictures uploaded for an unpublished comment MUST remain private
  to their uploader until the comment is successfully saved. A comment MUST NOT
  be saved with an incomplete or failed picture reference. Unpublished uploads
  MUST expire after 24 hours; published pictures and previous comment pictures
  MUST remain retained. Upload failure MUST leave unsent comment text available
  for retry during the current editing session.

- **FR-048**: Authorized writers MUST be able to set, change, or clear one optional
  calendar due date on an issue or subtask. Dates MUST be valid and MUST retain
  the chosen day across client time zones. Due dates in the past MUST remain valid.
- **FR-049**: An issue or subtask MUST be marked Overdue when its due date is
  before the current company-calendar date and its status is not Done. A due date
  today or an absent due date MUST NOT be overdue. Details, cards, and search MUST
  use the same calendar rule, including after reopening a completed issue.
- **FR-050**: Writers MUST be able to create or select reusable project-scoped
  labels and add or remove up to ten from an issue or subtask. Names MUST be
  trimmed, nonblank, at most 40 characters, and unique within the project ignoring
  letter case. Matching names MUST reuse the existing label. Arabic names MUST
  preserve their text; removing a label from one issue MUST leave other uses intact.
  Authorized readers MUST be able to list the project's labels.
- **FR-051**: Issue lists and saved board views MUST support inclusive due-date
  ranges, overdue/not-overdue filters, and selection of one or more labels.
  All selected labels MUST be required matches. Due-date ranges MUST exclude
  undated work; not-overdue MUST include undated work. Reversed ranges MUST be
  rejected. Parent filtering MUST return only subtasks of that parent.
- **FR-052**: Review MUST be a saved workflow status and a column on every board,
  available to issues and subtasks through both channels. Entering or leaving it
  MUST preserve normal permissions, ordering, and completion guards; no special
  reviewer role or compulsory approval step MUST be required in this MVP.
- **FR-053**: Custom-board creators with current write access and Administrators
  MUST be able to configure or clear optional warning limits for the In Progress
  and Review columns. Each configured limit MUST be an integer from 1 to 1,000.
  Only Administrators MAY configure default-board limits. New boards MUST start
  with limits unset; saved limits MUST be consistent across both channels.
- **FR-054**: A configured column MUST show a textual warning when its matching
  issue count exceeds its limit, with current count and limit available through
  both channels. The count MUST include all issues and subtasks matching the
  board's saved filter in that status, regardless of temporary filters, loading,
  or collapsed columns. A count equal to the limit MUST NOT trigger an exceeded
  warning. Warnings MUST clear when the count returns within the limit and MUST
  NOT block otherwise valid moves.
- **FR-055**: Writers MUST be able to create a Subtask under one non-Done Task
  or Bug in the same active project. It MUST receive its own ordinary project
  issue identifier and actual reporter. A Subtask MUST NOT have child subtasks.
- **FR-056**: A Subtask MUST use the same project permissions and support its
  own title, description, assignee, priority, due date, labels, status, comments,
  pictures, and blocked-by links. Parent and project relationships and Subtask
  type MUST be immutable. A parent MUST expose its subtasks and Done/total progress;
  a subtask MUST identify and permit navigation to its parent. All Issues boards
  and My Issues MUST include subtasks subject to ordinary filters.
- **FR-057**: A parent MUST NOT move to Done while any subtask or direct blocker
  is unfinished. Rejections MUST identify the unfinished work. Completing the
  last subtask MUST NOT automatically change parent status. A Done parent MUST
  be explicitly reopened before creating or reopening a subtask under it.
- **FR-058**: The system MUST reject nested subtasks, cross-project parenting,
  reparenting, and conversions between Subtask and Task/Bug types. Creating or changing a dependency
  MUST NOT produce a completion-prerequisite cycle through explicit links,
  parent/subtask relationships, or their combination.
- **FR-059**: Writers MUST be able to select identifiable user mentions in comments,
  using @ selection in the web editor and validated user references through MCP.
  Only approved active users with current read access to that project MUST be
  eligible. Candidates MUST expose only identifier and display name. Unselected
  @text MUST remain ordinary text and MUST NOT create a notification.
  Invalid newly added references MUST be rejected. Previously saved mentions
  MAY remain when editing a comment after those users lose access, without
  notifying ineligible users again.
- **FR-060**: Saved actions MUST generate in-app notifications according to the
  Notification Rules table below. Mentions added during an edit MUST notify only
  newly added recipients. The actor MUST be excluded from all notifications for
  their own action. Failed or rejected changes MUST generate no notifications.
- **FR-061**: Each saved event MUST produce at most one notification per eligible
  recipient for its affected issue, combining applicable reasons when needed.
  Retries MUST NOT duplicate delivery. Recipients MUST be approved, active, and
  currently authorized to read the affected project when the notification is
  created; events MUST NOT accept arbitrary recipient overrides.
- **FR-062**: Each user MUST have a personal newest-first inbox with unread count,
  unread filtering, issue reference, actor, time, and plain-text event summary.
  Users MUST be able to open entries, mark one read or unread, and mark all
  currently accessible entries read. Only the recipient MUST be able to list,
  read, or change their notifications, including when the caller is an
  Administrator. Current project access MUST be checked on every read, count,
  or read-state change; unavailable entries MUST expose no company content.
- **FR-063**: Notifications from a successful saved event MUST be available on
  the next authorized inbox read and retained across sign-out and restart.
  Notification summaries and mentions MUST support Arabic and mixed-language
  text. Notification read-state changes MUST NOT modify issue content, trigger
  further notifications, or grant access to the linked record.

### Role and Access Matrix

A company Administrator can access every project without a separate membership.
A non-Administrator has either Member or Viewer membership per project. Granting
Administrator status preserves existing memberships; those memberships determine
project access again if Administrator status is later revoked. All
permissions below require an active approved account; content writes additionally
require an active project. Comment ownership still applies to Administrators.
Custom board settings require its creator's current write access or Administrator
status; card edits use ordinary project issue permissions, not board ownership.
Date, label, subtask, and mention writes follow those same content permissions.
Personal notification inboxes belong only to their recipient, including for
Administrators; read-state changes are personal actions, not project edits.

| Action | Administrator | Project Member | Project Viewer |
| --- | --- | --- | --- |
| Read project, boards, issues, dependencies, labels, comments, pictures, and eligible assignees/mention candidates | All projects | Joined projects | Joined projects |
| Create or edit issues/subtasks, assign work, change status, and reorder cards | Yes | Yes | No |
| Set due dates, create labels, and add/remove issue labels | Yes | Yes | No |
| Add or remove blocked-by dependencies | Yes | Yes | No |
| Create custom boards | Yes | Yes | No |
| Manage custom board settings and WIP limits, archive, or restore | Any board | Own boards with current write access | No |
| Configure default-board WIP limits | Yes | No | No |
| Upload issue or comment pictures | Yes | Yes | No |
| Add comments/mentions and edit own comments | Yes | Yes | No |
| Edit another person's comment | No | No | No |
| Create, edit, archive, or restore projects | Yes | No | No |
| Approve or manage company accounts and Administrator status | Yes | No | No |
| Grant, change, or remove project membership | Yes | No | No |
| Read and manage own notification inbox | Own inbox only | Own inbox only | Own inbox only |
| Inspect company activity history | Yes | No | No |

### Notification Rules

All rows exclude the actor and require current approved, active project read
access. When one saved event gives the same person multiple reasons, it produces
one inbox entry for that issue containing those reasons.

| Saved event | Recipients |
| --- | --- |
| New comment | Issue reporter, current assignee, and explicitly mentioned users |
| Edited comment | Newly added mentioned users only |
| New or changed assignment to a person | New assignee |
| Workflow status change, including entering Review | Issue reporter and current assignee |
| Due date set, changed, or cleared | Issue reporter and current assignee |
| An issue becomes blocked or its last unfinished direct blocker is resolved/removed | Affected dependent issue's reporter and current assignee |
| Subtask created, or the parent's last unfinished subtask reaches Done | Parent issue's reporter and current assignee |

Label-only changes and personal read-state changes generate no notifications.
Delivery is an in-app inbox in the MVP; email, mobile push, and scheduled deadline
reminders are outside this release. A notification is read when its recipient
opens it from their inbox or explicitly marks it read.

### MVP Scope Boundaries

The MVP includes all ten stories: projects and roles, named Kanban boards with
saved filters, drag-and-drop and ordering, To Do/In Progress/Review/Done workflow,
configurable WIP warnings, issues with due dates and project labels, one level
of subtasks, blocked-by dependencies, safe HTML comments with mentions and uploaded
pictures, Arabic and mixed-language content, personal in-app notifications,
persistent history, and web and MCP access.

Unsafe executable HTML/CSS, public attachment hosting,
remote image embedding, full Arabic interface translation, email or push delivery,
scheduled reminders, watcher subscriptions, sprints, epics, nested subtasks,
reparenting, custom fields, custom workflow scripting, cross-project
boards and dependencies, cross-project issue moves, permanent deletion, Jira
imports, third-party business integrations, public guest access, multiple companies,
and native mobile applications are outside this release.

### Key Entities *(include if feature involves data)*

- **Company User**: Approved employee identity, unique email, display name,
  active/inactive state, and whether they hold company Administrator status.
- **Project**: Named work area with permanent key, optional description, active or
  archived state, and associated issues and memberships.
- **Project Membership**: Relationship between a user and a project with exactly
  one Member or Viewer role; company Administrator permissions take precedence
  while that status is active.
- **Issue**: Project work item with permanent identifier, title, description,
  type, priority, status, reporter, optional assignee, due date, labels, optional
  parent, timestamps, and revision. A Subtask is an issue with one immutable parent.
- **Kanban Board**: Named saved view belonging to one project, with creator,
  default/custom designation, filters, optional In Progress and Review warning
  limits, active/archived state, revision, and cards grouped into starting and custom stages with editable column names, order and allowed moves.
- **Card Order**: Shared project ordering of issues within each status, preserved
  across boards and changed explicitly by a move or reorder.
- **Issue Dependency**: Directed relationship saying that one issue is blocked
  by another issue in the same project, with retained creation and removal history.
- **Comment**: Safe rich-text HTML discussion attached to one issue, with readable
  text equivalent, paragraph direction, inline picture references, permanent
  author, validated user mentions, creation time, optional last-edit time, and revision.
- **Label**: Reusable project-scoped name attached to zero or more issues, with
  an identity separate from its case-insensitive display name.
- **Notification**: Personal entry for one saved event and affected issue,
  recipient, actor, reasons, time, readable summary, and read/unread state;
  readable only while the recipient retains access to the underlying project.
- **Picture**: Uploaded issue image with permanent identifier, filename, type,
  size, description, uploader, and upload time; private while unpublished and
  protected by project access after publication.
- **Activity Record**: Retained account, membership, project, issue, or comment
  change, including boards, ordering, dependencies, and pictures, attributable
  to a user, a time, and a web or MCP action.
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
  search, board-opening, inbox-opening, and confirmed-edit actions complete within two seconds
  from submission to displayed result once the service is active. The first
  project-list or board-opening action after an idle period completes within five
  seconds in at least 95% of measured trials; active and idle-start trials are
  reported separately. Picture transfer time is measured separately in SC-010;
  opening an issue or board MUST not wait for every full-size picture to download.
- **SC-004**: In at least 20 complete assistant-driven work sessions, an authorized
  user can find a project, create a filtered board and issue, assign it, link and
  resolve a blocker, set dates and labels, create and complete a subtask, move
  through Review, configure a WIP warning, post formatted Arabic with a picture
  and mention, and read their inbox through MCP without entering those changes
  in the web app. In every
  session, the next web read shows the same saved work.
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
- **SC-008**: In every acceptance case, board creation or filter editing leaves
  issue content unchanged, card order survives reopening both channels, unfinished
  blockers prevent Done, completed blockers permit Done, and duplicate, cyclic,
  self-referential, or cross-project dependencies have the specified outcomes.
  Parent completion also respects unfinished subtasks and combined prerequisite cycles.
- **SC-009**: At least 30 representative Arabic and mixed Arabic/English comment
  examples, including lists, links, issue identifiers, numbers, punctuation, and
  picture descriptions, retain their text and readable direction after web and
  MCP round trips. Every unsafe-HTML and unauthorized-picture acceptance case
  prevents execution or disclosure while preserving supported allowed content.
- **SC-010**: Under the stated network and workload assumptions, at least 95% of
  at least 100 supported-picture upload trials, including 10 MiB pictures,
  complete from file selection to confirmation that the uploaded picture is ready
  to attach within 30 seconds. Every failed-upload case leaves the unsent text
  available and no broken saved reference.

- **SC-011**: Every date/label acceptance case preserves selected calendar dates,
  applies the same overdue rule in both channels across company midnight,
  reuses duplicate label names, enforces field limits, and returns exactly the
  authorized matches for combined date and label filters.
- **SC-012**: Every subtask acceptance case preserves parent identity and ordinary
  project permissions, exposes independent child work and accurate Done/total
  progress, rejects invalid hierarchy and prerequisite cycles, and prevents parent
  completion with unfinished prerequisites without automatic status changes.
- **SC-013**: In at least 100 notification-producing action trials, every eligible
  non-actor receives exactly one entry per event and affected issue with the
  correct reasons, including retries and combined mention/assignee/reporter roles.
  No failed action or unauthorized read produces content disclosure. At least
  95% of entries are available within five seconds of the saved event and appear
  on the next inbox read; private read state agrees across both channels.
- **SC-014**: In every board acceptance case, Review status and order persist,
  configured WIP counts use the full saved view, equal-to-limit counts do not
  warn, exceeded limits are reported in readable text, and a warning never blocks
  an otherwise permitted move. Default/custom-board configuration permissions
  pass through both channels, including keyboard use in the web app.

## Assumptions

- **Company model**: One company owns this installation. Multi-company separation
  and subscription billing are outside the MVP.
- **Access defaults**: The company owner provisions the initial approved
  Administrator before employee onboarding. Subsequent accounts require approval;
  public registration and anonymous access to company work are unavailable.
- **Roles and workflow defaults**: Three roles, Task/Bug/Subtask types, three
  priorities, and four statuses are deliberate MVP defaults. Review is an ordinary
  stage, not a formal approval gate or separate reviewer role. Blocked is an
  indication independent of columns. Unfinished blockers and subtasks prevent
  completion; no required assignee is imposed.
- **Board defaults**: Boards belong to one project and inherit its read access.
  Members may create shared filtered boards; creators and Administrators manage
  their settings. Card order is shared across a project's boards to keep ranking
  understandable and simple. Column names/order and board transition rules are editable;
  custom saved stages are included; cross-project boards remain outside this MVP.
  In Progress and Review limits start unset and are warnings,
  not hard limits; board owners or Administrators choose values for their team.
- **Date and label defaults**: Due dates are optional calendar dates, evaluated
  against the company calendar, initially Africa/Cairo. This default follows
  the client's location and is an assumption for planning, not a measured company
  policy. Dates do not shift with browser time zones. Labels are project-scoped;
  issues and subtasks maintain their own dates and labels without automatic inheritance.
- **Subtask defaults**: One level under Task or Bug, with independent ownership and
  workflow. Parent links are immutable in this MVP. Parents are completed explicitly
  only after their subtasks and direct blockers; reopen a Done parent before adding
  or reopening child work.
- **Notification defaults**: The MVP uses a personal in-app inbox with the explicit
  event/recipient rules above. No external message is sent. Mentions are selected
  user identities, not parsed guesses from text. Accounts and current access are
  checked for creation and reading; private inboxes do not imply extra project access.
- **Dependency defaults**: The user's clarification means one developer's issue
  depends on another issue being Done, rather than a manually entered blocking
  note. Links are between issues in the same project for this release, can have
  different assignees, and do not automatically change dependent workflow statuses.
- **Comment and picture defaults**: HTML means supported safe rich-text formatting,
  not arbitrary executable HTML. Pictures can be uploaded to issues or placed
  inline in comments; supported formats, text limits, and file-size limits are
  explicit MVP defaults. Source-code HTML editing is not required in the web app.
- **Arabic scope**: Arabic and bilingual content, right-to-left paragraphs, and
  preserved text are required. Translating every interface label into Arabic is
  outside this request.
- **MVP workload**: The initial planning and performance baseline is 50 concurrent
  active users, 20 projects, 10,000 issues total with up to 2,000 in one project,
  and 20,000 comments total with up to 500 on one issue. Include up to three boards
  per project, 1,000 dependency links, and 1,000 published pictures averaging
  1 MiB each in the baseline; include maximum-size pictures in upload trials.
  Include 2,000 subtasks within the issue total, ten reusable labels per project,
  due dates on half the issues, and 50,000 notifications across users. WIP trials
  include exceeded and non-exceeded In Progress and Review columns; notification
  trials include duplicate roles, edits, retries, and revoked access.
  At least 20% of test comments and notification summaries are Arabic or bilingual.
  These are planning assumptions, not measured current company usage; revisit them before planning
  if the company's expected workload differs.
- **Performance measurement**: Use a supported current desktop browser on an
  ordinary company laptop, a stable connection of at least 10 Mbps and no more
  than 100 ms round-trip latency to the hosting region, and at least 100 trials
  per measured action under the baseline workload. An idle-start trial begins
  after the service has been idle for 30 minutes. Measure from submitting a web
  action to its displayed confirmed result; assistant thinking time is outside
  these web measurements.
- **Client scope**: The web app targets modern desktop and tablet browsers.
  A compatible MCP client that supports the declared picture-transfer operations
  is available to demonstrate assistant workflows; clients without HTML rendering
  can use text equivalents and picture references. Building an assistant or model
  provider is outside the MVP.
- **Dependencies**: The company must provide approved-user identities, the initial
  Administrator, a hosting account, and a compatible MCP client. Planning must
  choose the sign-in integration, durable protected picture storage, picture
  transfer, formatting validation, and operational setup within the ratified
  project constitution; no existing identity service is assumed.
- **Retention and edits**: Archival and account disabling preserve work history.
  Record history, notifications, previous rich comment versions, and published
  pictures are retained for the life of this installation in the MVP. Unpublished picture
  uploads expire after 24 hours. Picture retention and transfers must be included
  in hosting cost estimates. Offline edits, permanent deletion, and comment
  moderation are outside scope.
- **Scope of this artifact**: The ratified constitution supplies the requested
  stack, separation of frontend and backend, typing, performance, simplicity, and
  hosting rules. This specification defines observable business behavior; the
  next planning step applies those architecture constraints.


## Jira-style workspace and interaction addendum (2026-10-12)

User request: improve the complete existing web MVP into a polished Jira-style interface, including drag and drop. Preserve Angular strict typing, the separate Go backend, current permissions, Arabic content and all working MVP features.

- **UX-001**: Signed-in users receive a coherent workspace shell with a compact top bar, persistent left navigation, clear active states, readable typography, project context and working navigation. All controls represent implemented actions.
- **UX-002**: The Kanban board shows compact informative cards in To do/In progress/Review/Done, supports dragging the whole card surface between columns and ranking within a column, displays drop feedback, and preserves accessible keyboard controls, guarded Done, rollback/retry, bounded100-card windows and soft WIP warnings.
- **UX-003**: Issues use an easily scanned table/list with visible status, priority, assignee, date and issue key; common search controls remain prominent and advanced filters use progressive disclosure. Creation and editing receive focused, accessible presentation while retaining existing validation and unsaved-input recovery.
- **UX-004**: Projects, board management, workspace overview, issue detail/discussion, notifications and account management share consistent spacing, actions, badges, empty/loading/error states and responsive layouts. Issue details provide clear work information and a discussion area that preserves rich Arabic HTML and private pictures.
- **UX-005**: Navigation and primary workflows remain usable at1440px desktop,768px tablet and narrow mobile widths. Wide Kanban/table content may scroll inside a clearly bounded region. Visible keyboard focus, labeled controls, semantic links, live move feedback and reduced-motion preferences are preserved.

Acceptance: verify real local login, navigation, create/edit/search, board drag/reorder and keyboard fallback, blocked completion and WIP feedback, comments/pictures/RTL, roles and notifications against the actual API. Strict Angular/templates/tests and production build must pass. The board rendering bound and existing API/workload budgets remain unchanged. No additional backend service, infrastructure or UI component framework is required.

## Issue workspace and document attachments addendum (2026-10-12)

The user requested opening an issue by clicking its card, with comments, pictures and attachments, and confirmed that attachments include PDFs and documents.

- **UX-006**: Clicking the body of a board card or issue-list row opens that issue. Native link keyboard and open-in-new-tab behavior remains available; dragging a card and using its Move menu must not open the issue accidentally. Parent links continue opening the parent.
- **UX-007**: An opened issue prominently exposes Comments and Attachments before its subtask/dependency management, with working actions that focus the comment editor or file picker. Rich Arabic comments and inline/gallery pictures keep their current behavior and permissions.
- **ATT-001**: Approved issue viewers can list and download private document attachments. Issue editors can upload and detach PDF, UTF-8 TXT/CSV, DOCX and XLSX files up to10MiB. The server validates actual content and filenames; documents download as files, never execute or render as trusted HTML. Images retain the existing PNG/JPEG/WebP pipeline.
- **ATT-002**: REST and MCP use the same typed attachment service, authorization, bounded pagination, retry ledger and audit rules. Uploads survive retries without duplicates; detachment uses the issue revision, preserves durable retained content and is denied for archived projects or read-only users. Every download checks current resource access and uses private/no-store caching.
- **ATT-003**: Attachment errors preserve the selected file and comment draft. Upload/detach results appear on the next authorized read. Company files remain private durable objects on Google Cloud with no additional service, public file URL or infrastructure required.

Acceptance: through the real local API, open a card by its body, post an Arabic comment, add a gallery/inline picture, upload/download a PDF and document, verify list/read consistency and same-reference replay through REST/MCP, and reject invalid/oversized/unauthorized files and stale detach. Confirm dragging and keyboard movement still work, read-only users can view but cannot upload, and mobile layouts remain bounded. Preserve additive migrations for application rollback. Existing full-workload/cloud acceptance gates remain separate.


## Rich text and board editor addendum (2026-10-13)

The user requested HTML rich text and a Jira-like board/issue-flow editor. This addendum extends the original fixed-column presentation with explicit rich descriptions and configurable workflows. The confirmed FLOW-004 below includes unlimited custom stages with typed categories and stable identifiers.

- **HTML-001**: Issue descriptions and comments offer visual formatting and an HTML source mode with preview. Support headings, bold, italics, underline, lists, quotes, HTTP/HTTPS links and Arabic/mixed-language direction. Source may be posted/saved directly without an extra preview step. Unsafe markup and unsupported attributes must not execute or load remote pictures. Comments retain their existing private-picture and explicit-mention controls, author rules and limits.
- **HTML-002**: Descriptions distinguish retained plain text from canonical safe HTML with a typed format field. Existing plain descriptions, including literal angle-bracket text, remain readable as text. HTML descriptions preserve supported formatting through create/update/subtask, REST/MCP and current authorized reads. The existing 10,000-character stored description limit remains. Unsaved editor text/source survives failed and stale saves.
- **FLOW-001**: The current eligible board creator or Administrator can edit column names, drag or use keyboard buttons to reorder them, and choose allowed destination stages from each source. The default board remains all project issues with its fixed board name; its columns/flow are configurable by Administrators. Saved names are unique, trimmed and 1–60 Unicode characters; all starting stages appear exactly once and custom stages are supported as specified in FLOW-004. Every unfinished stage must retain a path to Done.
- **FLOW-002**: Names/order/rules persist without changing existing issue statuses, project-wide card ranking, filters, assignments or completion state. Board columns and card move menus use saved names/order. Drag destinations and keyboard options follow the allowed moves. The backend enforces the same rules through REST/MCP inside the existing project transaction. Moves with a source board use its rules; moves without one use the default board. Blocker/subtask completion guards and soft WIP warnings retain their behavior.
- **FLOW-003**: Board changes use the existing board revision, retry identity and audit transaction. An omitted workflow field preserves saved settings for older clients. Old retained retry results remain readable. Stale settings preserve the local draft and require explicit review of the current board before saving again. Viewer/non-manager and archived-project/board mutations remain denied.

Acceptance: exercise HTML source/preview/direct save with Arabic formatting and unsafe markup, preserve literal legacy descriptions, create/read through real REST/MCP, drag/reorder/rename board columns, enforce allowed moves and default-board fallback, retain drafts on conflict, and verify current roles, migration and old-client omission behavior. Keep bounded per-column queries and 100-card windows while supporting a variable stage count. External production gates remain separate.


## Custom stages and inline picture confirmation (2026-10-13)

- **FLOW-004**: Board managers can add as many custom stages as needed without a fixed count, rename/reorder every stage, and choose allowed moves. The initial four stages remain as stable identities and may be renamed. Each custom stage has a persistent project identifier and an immutable typed category (To do, In progress, Review or Completed); cards, rank/order revisions, filters, WIP warnings, transport schemas, completion/dependency/subtask guards and current-access checks support these identities. New stages appear on all project boards, advancing their revisions, so cards do not disappear on another board; each board retains its own presentation and transitions. Expanded destinations respect existing category routing. Stages are retained for existing issue/history identity; Reset restores move rules and retains custom stages. Every unfinished stage must reach a completed stage. The API's ordinary request-byte bounds still apply.
- **HTML-003**: Users can paste or drop a PNG/JPEG/WebP file directly into an existing issue description or comment visual editor. Pasting uploads privately and inserts an authenticated inline picture with a readable description; a failed upload keeps its selected file and retry reference. Formatting and Arabic remain intact. Description picture uploads expose their committed issue revision so only the editor's own single revision advances are accepted automatically; concurrent edits still require conflict review. A pending picture cannot be lost by submitting early. Users create an issue before adding private description pictures. Description picture references must be published and belong to that issue; remote/browser-source URLs, scripts and event handlers are removed. Previously published referenced pictures remain readable after gallery detach, subject to current permissions.
- **ATT-004**: Issue editors can attach any file kind, including ZIP, legacy Office documents, videos, design files and source files, as an opaque private download of up to10MiB. Recognized PDF/TXT/CSV/DOCX/XLSX declarations keep content validation; other kinds use application/octet-stream. No file is executed, unpacked or rendered as trusted HTML. Filename, size, current access, retry, retained history and revision-checked detach rules apply across REST and MCP.

Acceptance: save and reload custom QA/Ready to deploy stages; drag and keyboard-move real cards into them; read their names and counts through REST and MCP and other boards; prove a workflow beyond common small stage limits. Exercise a completed custom category with prerequisites, open/done category filters, stale board edits, and no duplicate retries. Paste real clipboard pictures into description and comment editors, read them in a Viewer session, reject foreign/expired-draft description images, and upload/download arbitrary opaque bytes. Preserve legacy plaintext and old cached mutation receipts. These confirmed rules supersede FLOW-001's four-column upper bound and ATT-001's exclusive document-kind list.


## Daily Jira workflow completion (2026-10-13, user-authorized audit follow-up)

This addendum supersedes the earlier exclusions for watcher subscriptions, issue archiving,
additional same-project issue links and backlog planning. Sprints, epics, estimates, automation,
custom fields and external production qualification remain outside this implementation.

- DAILY-001: Members change status and edit assignment, priority and dates directly in an issue; current permissions, revisions and prerequisite guards remain authoritative. An issue preview drawer preserves the underlying board, filters and scroll position.
- DAILY-002: One project workflow controls every board, REST and MCP. Stage edits synchronize names and transitions, support retirement with an explicit replacement, preserve issue/history identities, and expose independent per-stage WIP warnings. Existing differing workflows remain restrictive until explicitly reconciled by a workflow save.
- DAILY-003: Issue comments, history and all-activity views are available to current project readers, without exposing unrelated administrative activity or private fields.
- DAILY-004: Creation supports queued pictures/files and uploads them after the issue is durably created, with clear partial-failure retry and no duplicate issues. Drafts survive closing/reopening within the signed-in session; navigating away warns before discarding unsubmitted work. Private draft data is cleared on sign-out and never persisted to browser storage.
- DAILY-005: Exact custom-stage and specific-teammate filters, bounded sorted search, persistent private saved searches, selection and explicit bulk edit results are available. Bulk operations reuse revision-checked services, expose per-issue failures, and never silently overwrite stale issues.
- DAILY-006: One attachment area supports multiple-file queues, private image/PDF preview, download fallback for other types, and safe references in descriptions/comments. Existing 10 MiB/file and private access restrictions remain.
- DAILY-007: Foreground idle polling refreshes board, issue history/comments and inbox without resetting drafts, board scroll or pending mutations; hidden tabs pause work.
- DAILY-008: Board avatars filter assignees; eligible stages offer quick creation; mobile controls are compact with an accessible stage jump selector. Workflow previews show actual allowed transitions, with keyboard alternatives.
- DAILY-009: Backlog planning separates unstarted work from active delivery. Issues can be archived/restored without deleting history; cancellation is represented by a named completed stage. Cloning creates an independent issue with safe copied fields and explicit attachment handling. Watchers receive authorized issue-change notifications. Same-project relates-to and duplicates links retain history.

Acceptance includes Member/Viewer/Admin and revoked access, custom stages and retirement,
blocked/subtask completion, stale edits and retries, Arabic content, multiple/private files,
keyboard/mobile use, background refresh with drafts, REST/MCP parity and existing regression tests.

## Jira-style UI refinement (2026-10-13)

- UI-001: The signed-in desktop workspace provides a keyboard-accessible sidebar collapse/expand control. Mobile retains its modal navigation, focus trap and Escape behavior.
- UI-002: The Kanban board prioritizes cards with one compact toolbar for search, people and filters. Filter controls remain labeled and keyboard accessible, with explicit close and Escape returning focus. Custom stages, WIP warnings, actual drag/drop and keyboard moves remain available; narrow screens retain horizontal board scrolling and stage navigation.
- UI-003: The issue drawer groups status and actions once, separates description from metadata, and offers keyboard-operable Comments/History tabs. Switching tabs preserves rich-text drafts; Add comment returns to the editor. HTML, Arabic, direct clipboard pictures, mentions and all supported attachments remain available.
- UI-004: Saved-search configuration and manual inline picture upload use progressive disclosure. Existing permissions, conflict/retry behavior, local drafts, generated contracts and REST/MCP behavior are unchanged.

Acceptance: compare fresh desktop/tablet/phone screenshots, verify keyboard focus and mobile
bounds, and run strict types, production build, unit and browser regression checks. This is a
Jira-inspired refinement of GateGoldJira's existing design system, not exact Atlassian branding
or a claim of full Jira feature parity.

## Direct issue editing and unified attachments (2026-10-13)

- UI-005: Clicking the issue title, description, assignee, priority, due date or labels opens a typed inline editor. Native Edit buttons provide keyboard access. Choosing an assignee or priority immediately saves that value; selecting or clearing a valid due date immediately saves it. Manually typed date segments remain local until Enter or leaving the field so intermediate years are not saved. Metadata menus have no ordinary Save button; choosing the confirmed value closes without a write. Failed metadata saves retain the selected value and immutable retry intent, while conflicts require explicit review and application of the rebased change. Title, description and labels retain explicit Save/Cancel; title inputs support Enter and editors support Escape. Viewers only see readable values. Own comments can be edited in their original position by clicking their text or Edit comment; links and picture previews remain independent actions.
- UI-006: Inline drafts remain in memory for the signed-in session, survive navigation, and retain their original revision. Failed requests retain values and stable retry references. A conflict requires explicit review; only the selected field is rebased onto the latest issue before the user saves again. Idle refresh pauses during editing.
- UI-007: One issue attachment grid replaces separate picture/document lists, counters, reload buttons and upload implementations. It uses one multiple-file queue, file chooser and drop target, consistent previews/download/remove controls, bounded paging, and existing private access and 10 MiB/file limits. Pictures and PDFs have private previews; other types offer downloads. Removed files remain available to authorized historical references. Failed previews can be retried. Stale removals require review.
- UI-008: Both rich-text editors share the same queue for image insertion and file references. Clipboard pictures remain supported. A newly published comment picture joins the issue attachment grid atomically when the comment is saved; an unsent picture remains private to its uploader. First publication advances the issue revision. Editing/replaying a comment never reattaches a picture explicitly removed from the grid. Historical records are not bulk reattached.

Acceptance covers full pages and board drawers, desktop and 390px mobile bounds, Arabic/HTML,
keyboard actions, draft recovery, conflict review, uncertain saves/uploads, mixed file queues,
private previews, download fallback, attachment retention, Viewer restrictions and REST/MCP parity.

## Product audit implementation (2026-10-13)

The owner authorized implementation of the recommendations in
[the product audit](validation/jira-product-audit-2026-10-13.md). This adds the following
buildable scope while retaining the original external release gates.

- AUDIT-IMP-001: Creating from Backlog atomically creates planned work; active-board creation retains its selected stage. Backlog has a clearly named, ranked planning view, keyboard/drag ordering, selection, and explicit move-to-board actions. Ordering is independent of active column order and handles stale revisions and retries.
- AUDIT-IMP-002: Assignee, label, blocker and related-issue pickers are searchable, accessible, Arabic-capable and paginated. Matches beyond the first25 remain reachable. Loading, empty, error and retry states are explicit; permissions and stale-response protection remain enforced.
- AUDIT-IMP-003: Issue creation starts with the essential fields and progressively reveals optional fields. Create/Cancel remain accessible while scrolling. Issue detail puts discussion close to the description, collapses empty related-work sections, and prioritizes work over secondary metadata on mobile. Existing draft/conflict/file behavior is preserved.
- AUDIT-IMP-004: Workflow editing uses a compact stage list and a focused stage editor with clear save and project-wide impact summaries. Ten or more stages, Arabic names, keyboard ordering, populated-stage retirement, WIP inheritance and unsaved changes remain usable and validated.
- AUDIT-IMP-005: Projects support optional epics/larger-work groups and releases/milestones with names, target dates, status, linked issues and completion progress. Issue membership in these groups is editable through web and MCP, revision checked, same-project scoped and retained in history.
- AUDIT-IMP-006: Kanban reports provide throughput, cycle time, aging active work and current blockers using actual transition events. Date windows and result sizes are bounded. Start/completion/reopened-work semantics are documented; last-updated timestamps do not substitute for transition durations.
- AUDIT-IMP-007: Users can set notification event preferences, due-date reminders and email/digest preferences. A durable PostgreSQL outbox supports deduplication, delivery retries and a configurable sender. Delivery rechecks active users and project access, honors opt-outs, and is disabled without configured delivery credentials. Local tests never send mail externally.
- AUDIT-IMP-008: Project CSV import offers field mapping, validation preview, per-row errors and explicit confirmation; retries do not duplicate rows and stable external keys support duplicate detection. Export preserves filters/access, bounds batches and neutralizes spreadsheet formula cells. CSV operations also have typed MCP access.
- AUDIT-IMP-009: Activity presents people, issue keys and plain-language changes with useful search/date filters; technical identifiers remain available on demand. The Projects search label uses an accessible, correctly aligned implementation.
- AUDIT-IMP-010: Issues can retain validated development references such as pull-request/commit links. A simple project rule can assign an eligible teammate when work enters a chosen stage; rules are explicit, auditable, permission scoped and do not bypass workflow/completion guards.
- AUDIT-IMP-011: Production employee onboarding has a reviewable invitation/approval/first-login path and clear administrator setup guidance. Local development starts web/API together with health checks and retained logs. Real provider authorization, cloud deployment/restore and representative-human testing remain measured external qualification steps.

Acceptance includes Administrator/Member/Viewer and revoked access, archived projects,
Arabic/HTML, mobile/keyboard, pagination beyond25, failed/uncertain mutations, stale revisions,
import duplicate handling, notification opt-out/dedup/revocation, actual transition-based metrics,
generated contract consistency and REST/MCP parity. Optional enterprise customization and Scrum
features mentioned as later possibilities in the audit remain outside this Kanban scope.

## Daily editing and board controls follow-up (2026-10-13)

The owner accepted fixing comment editing and planning drafts, then improving board
controls and the rich-text editor. This follow-up adds these observable behaviors:

- UI-009: Clicking an own comment's text opens its inline editor on an issue page or inside the board preview dialog. Links, picture previews and attachment actions keep their independent behavior; Viewer and other-author restrictions remain enforced.
- UI-010: Choosing or clearing an Epic or Release saves immediately. Choosing the confirmed value creates no write. Pending writes lock both planning selectors; failed changes retain the selected value, original revision and retry reference across navigation/drawer dismissal in the signed-in session. Conflicts require fetching the latest planning and explicit application of only the changed field, preserving the teammate's other planning field. Late responses from a previous issue or session cannot update or unlock the current issue. Cancel discards the draft and refreshes confirmed planning.
- UI-011: Board and board-settings assignee filters can find any eligible project teammate while typing, with bounded paging, loading/empty/error/retry states and stale-response/session protection. Existing filters remain usable without changing assignments.
- UI-012: A board can group its bounded loaded cards into horizontal assignee or epic swimlanes, or show no grouping. Counts and WIP continue to describe the authoritative full saved view. Drag and keyboard movement retain shared status/order semantics; grouping never silently changes an issue's assignee or epic. Cross-group dragging is rejected with guidance.
- UI-013: Users can create, apply and delete named personal quick filters using their existing project-scoped saved searches. Another user's filters remain private. Applying a filter retains current-access checks, shared ordering and bounded card windows; it does not edit the shared board definition.
- HTML-004: Descriptions and comments support code blocks, tables and checklists in visual and HTML modes. Safe server sanitization and the typed renderer preserve permitted structure and checklist completion while stripping scripts, event handlers and arbitrary interactive controls. Existing Arabic/RTL, mentions, private picture/file references and retained comment history remain supported. Read-only views display checklist state without changing content.

Acceptance covers issue pages and board dialogs; Member/Viewer/revoked access;
independent planning changes and stable uncertain retries; explicit conflict review;
late responses and draft recovery; eligible teammate lookup beyond the first page;
grouped board drag/keyboard behavior, saved-view WIP and personal-filter privacy;
safe rich HTML, source/visual round trips, Arabic and retained versions; desktop/mobile
bounds; generated contracts and real PostgreSQL/REST/MCP regressions. This follow-up
does not add new cloud services or replace the outstanding external qualification gates.
