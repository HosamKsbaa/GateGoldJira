# Notification preferences, reminders and delivery

The Inbox now has typed, revisioned preferences for notification events, Inbox delivery, email delivery (`off`, `instant`, `daily`) and due-date reminders. GET/PUT `/api/v1/notifications/preferences` and the equivalent MCP tools use the same service. Saves preserve their retry reference across an uncertain response, reject stale revisions and record changed settings in activity. Other users cannot supply a recipient override.

Defaults retain the previous Inbox behavior: all ten event kinds, email off and due reminders off. Preferences apply to new events; existing Inbox history remains readable. Email-only notifications are retained privately for delivery but excluded from the Inbox and unread count. Selecting no events suppresses new notifications.

## Durable work and permissions

Migration `00009_notification_preferences.sql` adds preferences, the delivery outbox, unique issue/date reminder events and indexes. A reminder is produced for unfinished, unarchived work due on the supplied company date, for its active assignee/reporter who still has project access and has opted in to `due_date` reminders. The reminder job works without SMTP and publishes to the Inbox when that channel is enabled.

Automated reminder events have the explicit, disabled, unapproved `GateGoldJira reminder` actor. This identity has no authentication binding and cannot sign in. It is retained for attribution rather than assigning an automated action to an employee. The job serializes bounded reminder creation with a PostgreSQL transaction advisory lock and uses issue/date and event/recipient uniqueness to prevent duplicate reminders across instances.

`notifications.NewWorker(pool, sender, frontendURL).RunOnce(ctx, companyToday)` is a bounded job entry point. Local development runs it immediately and every `NOTIFICATION_WORKER_INTERVAL_SECONDS` (default 60) on the server's lifetime context, and stops it before closing the database. Production uses the existing authenticated maintenance route and Cloud Scheduler every five minutes; no additional service or always-on instance is needed. PostgreSQL holds all durable state. Missing sender configuration disables only email.

Email delivery rechecks active approval, project membership, project/issue archival, current event preferences and opt-out immediately before sending. Due-date email also rechecks the current due date, assignee/reporter responsibility and completion state. Revoked or opted-out deliveries are cancelled. Failures retain durable state with exponential retry, up to eight attempts; exhausted items remain failed for investigation.

## Bounds and operational behavior

- Each invocation enqueues at most 1,000 previously unqueued recent events, prepares at most 500 new issue/date reminders and inserts at most 1,000 previously unnotified reminder recipients.
- A digest combines up to 50 eligible updates after the oldest queued update's 24-hour window. Further updates remain durable for the next bounded batch; this is not a guarantee of one unbounded email per calendar day.
- A worker handles at most 100 delivery batches within a 45-second context. The protected maintenance request gives notifications a 20-second slice of its 30-second budget, leaving ten seconds for private file cleanup. Reaching the notification slice leaves unfinished rows for the next scheduled call. SMTP has a ten-second deadline, with a five-second dial timeout bounded by that deadline.
- Delivery holds shared company, preference and project guards through SMTP acceptance. This serializes delivery against account/access revocation, opt-out and project archival. Slow SMTP can temporarily delay conflicting administrative or project writes, which retain their ordinary safe retry behavior. Warm local sink tests cover delivery and permissions; a deployed SMTP latency measurement remains necessary before sizing a busy company workload.
- SMTP requires STARTTLS with certificate verification. Plaintext is available only when explicitly configured for a loopback test sink. Credentials and message content are excluded from failure messages.
- SMTP is **at least once**. A crash after SMTP accepts a message but before the database commits may repeat its stable Message-ID. The worker does not claim exactly-once delivery.
- Queue preparation considers events produced after the latest saved preferences and within seven days. Historical Inbox entries are not bulk-emailed when a person first opts in.

No real messages were sent during implementation. Integration tests use a memory sink, and the SMTP protocol test uses an isolated loopback sink.

## Backend configuration

`NOTIFICATION_APP_URL` is the public web origin used in issue links; it defaults to the first allowed frontend origin. `SMTP_ADDRESS` and `SMTP_FROM` enable backend email delivery. If the relay needs authentication, provide both `SMTP_USERNAME` and `SMTP_PASSWORD` through server configuration. Never put these credentials in Angular config or source control. Leave all SMTP fields empty to keep delivery disabled.

Cloud Run takes the application URL from `frontend_origin`. Optional Terraform `smtp_address`, `smtp_from` and `smtp_username` settings use the `${name}-smtp-password` Secret Manager secret when authentication is needed. Add its value outside Terraform, then pin the reviewed numeric `smtp_password_secret_version`; secret values never enter a plan, state or frontend configuration. Configure and review the relay before enabling the backend candidate. The existing scheduler performs delivery without a production background ticker. Loopback plaintext is available only in development with `SMTP_ALLOW_LOCAL_PLAINTEXT=true`; production always requires verified STARTTLS.

## Activity usability

Activity responses now include issue keys, project/resource names and human action descriptions. The default UI shows people and work rather than UUIDs, links directly to the issue, formats times in the company time zone and places technical identifiers inside change details. Basic filters accept an exact issue key and inclusive company-calendar date range. Advanced kind/UUID filters remain available in a disclosure. Pagination cursors are bound to all filters.

## Verification

- PostgreSQL race tests cover preference defaults/privacy, revisions, cross-channel retry, event opt-out, durable email deduplication/retry, email opt-out, revoked membership, in-app reminders without SMTP, concurrent reminder jobs, digest grouping and cancellation of stale due mail.
- The REST/MCP parity scenario exercises preference read/save/replay after restart and identical reminder Inbox projections with membership revocation.
- PostgreSQL activity tests verify a Cairo calendar-day boundary, readable issue projections and cursor/date-filter isolation.
- Runtime tests cancel a real isolated delivery through a memory sink before closing PostgreSQL. The fixture regression verifies four approved local identities and the separately disabled, unapproved system actor without an identity binding or membership.
- Terraform validation and five credential-free mock plans verify the existing five-minute maintenance job, disabled email defaults, frontend links and optional pinned backend Secret Manager references. No deployment ran.
- Browser coverage verifies uncertain preference saves, responsive settings and activity issue-key/date filters. Screenshot evidence is generated by the repository's disposable browser runner.
