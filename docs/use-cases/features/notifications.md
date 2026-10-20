# Watching, private inbox and notification delivery

Canonical owner of watch/unwatch. Event creation, preference and worker behavior are documented independently from external SMTP delivery. Related test files are references only; no tests were executed for this inventory.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `watch`: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130)
- `watchUi`: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:276](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L276)
- `service`: [backend/internal/features/notifications/service.go:122](../../../backend/internal/features/notifications/service.go#L122)
- `single`: [backend/internal/features/notifications/service.go:189](../../../backend/internal/features/notifications/service.go#L189)
- `read`: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199)
- `all`: [backend/internal/features/notifications/service.go:277](../../../backend/internal/features/notifications/service.go#L277)
- `events`: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63)
- `inbox`: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36)
- `inboxState`: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:657](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L657)
- `preferenceUi`: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16)
- `preferences`: [backend/internal/features/notifications/preferences.go:16](../../../backend/internal/features/notifications/preferences.go#L16)
- `savePreferences`: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90)
- `worker`: [backend/internal/features/notifications/delivery.go:49](../../../backend/internal/features/notifications/delivery.go#L49)
- `delivery`: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108)
- `reminders`: [backend/internal/features/notifications/queries.sql:92](../../../backend/internal/features/notifications/queries.sql#L92)
- `currentDelivery`: [backend/internal/features/notifications/queries.sql:127](../../../backend/internal/features/notifications/queries.sql#L127)
- `smtp`: [backend/internal/features/notifications/smtp.go:32](../../../backend/internal/features/notifications/smtp.go#L32)

## Cases

<a id="uc-ntf-0001"></a>
### UC-NTF-0001 — Watch accessible issue

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Watch issue.

**Expected results**

- The caller subscription becomes active without changing issue content.

Sources: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130), [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:276](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L276).

Shared business operations: `set_issue_watch`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0002"></a>
### UC-NTF-0002 — Unwatch issue

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Watching to stop following an issue.

**Expected results**

- Only the caller subscription is removed.

Sources: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130), [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:276](../../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L276).

Shared business operations: `set_issue_watch`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0003"></a>
### UC-NTF-0003 — Watch as viewer

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Watch a currently readable issue as a viewer.

**Expected results**

- Read access is sufficient to manage the private subscription.

Sources: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130).

Shared business operations: `set_issue_watch`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0004"></a>
### UC-NTF-0004 — Keep watch state private

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Read another account view of the same issue.

**Expected results**

- One account cannot replace or expose another user subscription through its own watch control.

Sources: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130).

Shared business operations: `set_issue_watch`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0005"></a>
### UC-NTF-0005 — Retry original watch choice

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Repeat a watch change with original retry reference.

**Expected results**

- The accepted personal watch state is returned without duplicate subscription effects.

Sources: [backend/internal/features/issues/organization.go:130](../../../backend/internal/features/issues/organization.go#L130).

Shared business operations: `set_issue_watch`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0006"></a>
### UC-NTF-0006 — Notify watcher of generic issue change

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user changes an issue followed by the recipient.

**Expected results**

- The eligible watcher receives a watching reason when preferences permit.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0007"></a>
### UC-NTF-0007 — Notify responsible people of comment

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user posts a comment on an issue.

**Expected results**

- Eligible reporter/assignee receive the comment reason.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0008"></a>
### UC-NTF-0008 — Notify selected mention

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user selects the recipient as a comment mention.

**Expected results**

- The recipient receives a mention reason when still eligible.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0009"></a>
### UC-NTF-0009 — Notify new mention after comment edit

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Edit a comment so a newly selected person is mentioned.

**Expected results**

- Eligible newly mentioned people receive a mention event.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0010"></a>
### UC-NTF-0010 — Notify new assignee

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user assigns an issue to the recipient.

**Expected results**

- The recipient receives an assignment reason.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0011"></a>
### UC-NTF-0011 — Notify stage change

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user changes the issue stage.

**Expected results**

- Responsible users receive the status reason.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0012"></a>
### UC-NTF-0012 — Notify due-date change

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Another user changes the issue due date.

**Expected results**

- Responsible users receive the due_date reason.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0013"></a>
### UC-NTF-0013 — Notify new blocked state

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. An issue becomes blocked by unfinished work.

**Expected results**

- Responsible users receive dependency_blocked.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0014"></a>
### UC-NTF-0014 — Notify last blocker completion

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. The last required blocker finishes.

**Expected results**

- Responsible users receive dependency_resolved.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0015"></a>
### UC-NTF-0015 — Notify new subtask

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. A child issue is created for the parent.

**Expected results**

- Responsible users receive subtask_created.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0016"></a>
### UC-NTF-0016 — Notify last subtask completion

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. The last remaining child finishes.

**Expected results**

- Responsible users receive subtasks_completed.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0017"></a>
### UC-NTF-0017 — Suppress self-notification

Actor: `worker` · Kind: `permission` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. The actor is also a potential recipient of their own action.

**Expected results**

- No notification is addressed to that actor for the event.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0018"></a>
### UC-NTF-0018 — Consolidate overlapping reasons

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. One recipient qualifies as watcher, responsible user and mention target for an event.

**Expected results**

- The recipient record combines distinct reasons without duplicate notifications.

Sources: [backend/internal/features/notifications/events.go:63](../../../backend/internal/features/notifications/events.go#L63).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0019"></a>
### UC-NTF-0019 — Read private inbox

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open Notifications.

**Expected results**

- Only the caller currently accessible notifications appear newest first.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36), [backend/internal/features/notifications/service.go:122](../../../backend/internal/features/notifications/service.go#L122).

Shared business operations: `list_notifications`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0020"></a>
### UC-NTF-0020 — Read unread summary without mutation

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Request get_inbox_summary.

**Expected results**

- The current accessible unread count and company calendar date return without changing read state.

Sources: [backend/internal/features/notifications/service.go:122](../../../backend/internal/features/notifications/service.go#L122).

Shared business operations: `get_inbox_summary`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0021"></a>
### UC-NTF-0021 — Read one notification without marking it read

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Call get_notification for a current own notification.

**Expected results**

- Its content and revision return with unchanged readAt.

Sources: [backend/internal/features/notifications/service.go:189](../../../backend/internal/features/notifications/service.go#L189).

Shared business operations: `get_notification`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0022"></a>
### UC-NTF-0022 — Open notification issue

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Open issue from Inbox.

**Expected results**

- The notification is marked read and its issue opens.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:657](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L657), [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0023"></a>
### UC-NTF-0023 — Mark notification read

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Select Mark read on an unread notification.

**Expected results**

- Read state/revision and unread summary update.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199), [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0024"></a>
### UC-NTF-0024 — Mark notification unread

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Select Mark unread on a read notification.

**Expected results**

- ReadAt clears and the unread count reflects the change.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199), [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0025"></a>
### UC-NTF-0025 — Keep unchanged read state a no-op

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Set a current notification to its already saved read state.

**Expected results**

- The current record returns without another read-state change event.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0026"></a>
### UC-NTF-0026 — Reject missing current notification revision

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Set read state without a positive current revision.

**Expected results**

- Validation requires reading current state before changing it.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0027"></a>
### UC-NTF-0027 — Handle concurrent read-state changes

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save a stale notification revision.

**Expected results**

- A conflict includes current state; the stale request cannot overwrite it.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0028"></a>
### UC-NTF-0028 — Mark all accessible notifications read

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Mark all as read.

**Expected results**

- The caller accessible unread snapshot is marked read and changedCount/summary return.

Sources: [backend/internal/features/notifications/service.go:277](../../../backend/internal/features/notifications/service.go#L277), [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `mark_all_notifications_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0029"></a>
### UC-NTF-0029 — Repeat empty mark-all safely

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Mark all read when no accessible unread notification remains.

**Expected results**

- Changed count is zero and no false change event is created.

Sources: [backend/internal/features/notifications/service.go:277](../../../backend/internal/features/notifications/service.go#L277).

Shared business operations: `mark_all_notifications_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0030"></a>
### UC-NTF-0030 — Filter unread inbox

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Enable Unread only and apply the inbox filter.

**Expected results**

- Only unread current-access records are shown.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `list_notifications`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0031"></a>
### UC-NTF-0031 — Restore complete inbox view

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Disable Unread only and apply.

**Expected results**

- Read and unread records join the current accessible list.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `list_notifications`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0032"></a>
### UC-NTF-0032 — Page private inbox

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Next inbox page.

**Expected results**

- The next bounded private result page appears.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36), [backend/internal/features/notifications/service.go:122](../../../backend/internal/features/notifications/service.go#L122).

Shared business operations: `list_notifications`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0033"></a>
### UC-NTF-0033 — Refresh inbox

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Refresh inbox.

**Expected results**

- Current count and page reload with visible busy/error feedback.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Shared business operations: `list_notifications`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0034"></a>
### UC-NTF-0034 — Show caught-up state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open an unread-only inbox with no matches.

**Expected results**

- The page says the user is caught up.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0035"></a>
### UC-NTF-0035 — Show empty history state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open the full inbox with no notification history.

**Expected results**

- A distinct Nothing here yet explanation appears.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0036"></a>
### UC-NTF-0036 — Exclude revoked project content

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Remove project membership then reload inbox/summary.

**Expected results**

- Notifications and counts from inaccessible project content are excluded.

Sources: [backend/internal/features/notifications/service.go:122](../../../backend/internal/features/notifications/service.go#L122).

Shared business operations: `list_notifications`, `get_inbox_summary`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0037"></a>
### UC-NTF-0037 — Deny foreign notification read

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Request another user notification ID.

**Expected results**

- Unknown, foreign and inaccessible records share an unavailable outcome.

Sources: [backend/internal/features/notifications/service.go:189](../../../backend/internal/features/notifications/service.go#L189).

Shared business operations: `get_notification`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0038"></a>
### UC-NTF-0038 — Deny foreign notification mutation

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Set read state on another account notification.

**Expected results**

- The operation cannot change another user inbox.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199).

Shared business operations: `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0039"></a>
### UC-NTF-0039 — Permit viewer private inbox changes

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Read and set read state on own notification as Viewer.

**Expected results**

- Project read access suffices for personal inbox state changes.

Sources: [backend/internal/features/notifications/service.go:199](../../../backend/internal/features/notifications/service.go#L199).

Shared business operations: `get_notification`, `set_notification_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0040"></a>
### UC-NTF-0040 — Retry uncertain inbox mutation

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Retry a lost accepted read/mark-all response using the original pending intent.

**Expected results**

- The operation resolves without duplicate semantic changes.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:657](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L657).

Shared business operations: `set_notification_read`, `mark_all_notifications_read`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0041"></a>
### UC-NTF-0041 — Clear private inbox on session switch

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Change account while an inbox request is delayed.

**Expected results**

- Old private rows and pending results cannot populate the next account.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:657](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L657).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0042"></a>
### UC-NTF-0042 — Expand preference panel

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open Notification preferences.

**Expected results**

- Current delivery channels, selected event kinds and availability status appear.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `get_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0043"></a>
### UC-NTF-0043 — Read saved preferences

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Request current notification preferences.

**Expected results**

- The caller event/channel settings and revision are returned.

Sources: [backend/internal/features/notifications/preferences.go:16](../../../backend/internal/features/notifications/preferences.go#L16).

Shared business operations: `get_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0044"></a>
### UC-NTF-0044 — Enable in-app updates

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save Show new updates in my Inbox enabled.

**Expected results**

- Future eligible updates can appear in the caller inbox.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0045"></a>
### UC-NTF-0045 — Disable in-app updates

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save Show new updates in my Inbox disabled.

**Expected results**

- New inbox delivery stops while old inbox history remains accessible.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0046"></a>
### UC-NTF-0046 — Select individual event kinds

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Toggle supported assignment/mention/comment/status/dependency/subtask/due/watching choices.

**Expected results**

- The saved distinct event set controls future eligible deliveries.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0047"></a>
### UC-NTF-0047 — Select all event kinds

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Select all then save.

**Expected results**

- Every currently supported event reason is saved once.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0048"></a>
### UC-NTF-0048 — Select no event kinds

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Select none then save.

**Expected results**

- An empty event subscription set is retained.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0049"></a>
### UC-NTF-0049 — Set email off

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save Email updates Off.

**Expected results**

- New email delivery is disabled and queued work is rechecked before sending.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [backend/internal/features/notifications/queries.sql:127](../../../backend/internal/features/notifications/queries.sql#L127).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0050"></a>
### UC-NTF-0050 — Set instant email

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save As updates happen.

**Expected results**

- Instant delivery preference is retained independent of current SMTP availability.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0051"></a>
### UC-NTF-0051 — Set daily digest

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save Daily digest.

**Expected results**

- Daily grouping preference is retained.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0052"></a>
### UC-NTF-0052 — Show unavailable email configuration

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open preferences while workspace email is not configured.

**Expected results**

- The page explicitly says delivery is unavailable but preferences may be saved.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `get_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

Gaps: [GAP-NTF-001](../gaps.md#gap-ntf-001).

<a id="uc-ntf-0053"></a>
### UC-NTF-0053 — Enable due-today reminders

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save dueReminders enabled with due_date event and an active delivery channel.

**Expected results**

- Eligible due-today work can generate reminders.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90), [backend/internal/features/notifications/queries.sql:92](../../../backend/internal/features/notifications/queries.sql#L92).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0054"></a>
### UC-NTF-0054 — Explain deselected due-date event

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Enable due reminders while Due dates is unchecked.

**Expected results**

- The page explains selecting Due dates is needed for reminders.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0055"></a>
### UC-NTF-0055 — Reject unsupported email mode

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save an email mode outside off/instant/daily.

**Expected results**

- Validation rejects the preference change.

Sources: [backend/internal/features/notifications/preferences.go:16](../../../backend/internal/features/notifications/preferences.go#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0056"></a>
### UC-NTF-0056 — Reject unsupported notification event

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save an unknown event reason.

**Expected results**

- The preference command is rejected.

Sources: [backend/internal/features/notifications/preferences.go:16](../../../backend/internal/features/notifications/preferences.go#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0057"></a>
### UC-NTF-0057 — Reject duplicate event reason

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Repeat the same reason within the saved event array.

**Expected results**

- The service rejects duplicates.

Sources: [backend/internal/features/notifications/preferences.go:16](../../../backend/internal/features/notifications/preferences.go#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0058"></a>
### UC-NTF-0058 — Reject stale preference revision

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Save after another preferences revision has been committed.

**Expected results**

- Conflict guidance requires reloading saved settings.

Sources: [backend/internal/features/notifications/preferences.go:90](../../../backend/internal/features/notifications/preferences.go#L90).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0059"></a>
### UC-NTF-0059 — Retry uncertain preference save

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Retry the frozen original pending preference payload.

**Expected results**

- The accepted preference result returns without duplicate changes.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `update_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0060"></a>
### UC-NTF-0060 — Reload saved preference values

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Choose Reload saved preferences.

**Expected results**

- The form reads current persisted choices.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Shared business operations: `get_notification_preferences`.

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0061"></a>
### UC-NTF-0061 — Generate company-day reminders

Actor: `worker` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Run maintenance for the company current calendar date.

**Expected results**

- Due-today unfinished active work notifies eligible assignee/reporter using selected channels.

Sources: [backend/internal/features/notifications/delivery.go:49](../../../backend/internal/features/notifications/delivery.go#L49), [backend/internal/features/notifications/queries.sql:92](../../../backend/internal/features/notifications/queries.sql#L92).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0062"></a>
### UC-NTF-0062 — Suppress duplicate due reminders

Actor: `worker` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Run maintenance again for the same issue due date.

**Expected results**

- Existing due event/recipient uniqueness prevents another in-app reminder.

Sources: [backend/internal/features/notifications/queries.sql:92](../../../backend/internal/features/notifications/queries.sql#L92).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0063"></a>
### UC-NTF-0063 — Skip completed or archived reminder work

Actor: `worker` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Run maintenance for completed or archived work or archived projects.

**Expected results**

- No new due reminder is created for those records.

Sources: [backend/internal/features/notifications/queries.sql:92](../../../backend/internal/features/notifications/queries.sql#L92).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0064"></a>
### UC-NTF-0064 — Skip reminders after due date changes

Actor: `worker` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Process queued reminder after due date no longer matches its reminder event.

**Expected results**

- Current delivery eligibility prevents sending the obsolete reminder.

Sources: [backend/internal/features/notifications/queries.sql:127](../../../backend/internal/features/notifications/queries.sql#L127).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0065"></a>
### UC-NTF-0065 — Deliver instant email

Actor: `worker` · Kind: `happy_path` · Implementation: `external_pending` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Run configured delivery for an eligible instant update.

**Expected results**

- Email includes current issue key/title, safe summary and authenticated website link.

Sources: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108), [backend/internal/features/notifications/smtp.go:32](../../../backend/internal/features/notifications/smtp.go#L32).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

Gaps: [GAP-NTF-001](../gaps.md#gap-ntf-001).

Note: Worker/sender code exists; actual deployment mail receipt requires external configuration and evidence.

<a id="uc-ntf-0066"></a>
### UC-NTF-0066 — Deliver bounded daily digest

Actor: `worker` · Kind: `performance` · Implementation: `external_pending` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Process due daily deliveries.

**Expected results**

- At most 50 eligible updates are grouped with current issue links.

Sources: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

Gaps: [GAP-NTF-001](../gaps.md#gap-ntf-001).

<a id="uc-ntf-0067"></a>
### UC-NTF-0067 — Cancel revoked queued delivery

Actor: `worker` · Kind: `permission` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Remove account/project access or disable selected email/event before delivery.

**Expected results**

- Current authorization/preferences cause queued records to cancel rather than expose data.

Sources: [backend/internal/features/notifications/queries.sql:127](../../../backend/internal/features/notifications/queries.sql#L127), [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0068"></a>
### UC-NTF-0068 — Retry temporary mail failure

Actor: `worker` · Kind: `failure` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. The sender returns an error.

**Expected results**

- Delivery is rescheduled with increasing delay rather than marked sent.

Sources: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0069"></a>
### UC-NTF-0069 — Stop exhausted mail retry

Actor: `worker` · Kind: `failure` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. The sender keeps failing through the bounded attempt limit.

**Expected results**

- The delivery becomes failed instead of retrying forever.

Sources: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0070"></a>
### UC-NTF-0070 — Preserve mail commit uncertainty

Actor: `worker` · Kind: `failure` · Implementation: `implemented` · Surfaces: `background`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Allow a real local SMTP sink to acknowledge the owned DATA payload, hold only that delivery’s QUIT response, and kill only the owned secondary worker with SIGKILL before Send returns or its database transaction commits.
2. Observe the retained pending row, then restart the captured server and let it retry the same delivery.

**Expected results**

- The acknowledged external SMTP acceptance is not rolled back with the database transaction: the retained row remains pending with attempt 0 after the crash.
- The retry may be acknowledged a second time with the same stable Message-ID, then persist sent with attempt 1; this demonstrates at-least-once mail and does not promise duplicate suppression.

Sources: [backend/internal/features/notifications/delivery.go:108](../../../backend/internal/features/notifications/delivery.go#L108).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go), [coverage-notification-worker.spec.ts](../../../frontend/e2e/coverage-notification-worker.spec.ts).

Gaps: [GAP-NTF-002](../gaps.md#gap-ntf-002).

Note: This case documents the send-before-commit boundary, not a guarantee of duplicate suppression.

Note: Local acceptance clarifies crash-before-commit rather than claiming a PostgreSQL COMMIT error was injected. Intended-provider receipt remains a separate pending acceptance target.

Note: A SIGKILL can prevent Go coverage counter flushing for that child; runtime case evidence and measured source coverage must be reported separately.

Note: The real local SMTP integration now verifies accepted DATA followed by owned-worker SIGKILL, retained pending attempt 0, and a second accepted delivery with the same Message-ID before sent attempt 1. The inherent at-least-once boundary remains documented; intended-provider acceptance remains pending separately.

<a id="uc-ntf-0071"></a>
### UC-NTF-0071 — Render Arabic inbox content

Actor: `user` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Read notifications whose actors and summaries contain Arabic and mixed-direction text.

**Expected results**

- Names are bidi-isolated and summaries use automatic direction.

Sources: [frontend/src/app/features/notifications/pages/inbox/inbox.page.ts:36](../../../frontend/src/app/features/notifications/pages/inbox/inbox.page.ts#L36).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).

<a id="uc-ntf-0072"></a>
### UC-NTF-0072 — Use preferences on narrow screens

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is active and approved; issue notifications refer to currently accessible project content unless a denial case states otherwise.

**Steps**

1. Open preferences at a narrow viewport and use keyboard-labelled controls.

**Expected results**

- Delivery choices remain reachable with visible state and labelled controls.

Sources: [frontend/src/app/features/notifications/components/notification-preferences.component.ts:16](../../../frontend/src/app/features/notifications/components/notification-preferences.component.ts#L16).

Related test files: [notifications.spec.ts](../../../frontend/e2e/notifications.spec.ts), [audit-notifications.spec.ts](../../../frontend/e2e/audit-notifications.spec.ts), [events_test.go](../../../backend/internal/features/notifications/events_test.go).
