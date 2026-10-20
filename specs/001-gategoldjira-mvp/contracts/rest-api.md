# REST and Shared Wire Contract

**Contract version**: 1.2.0 | **API prefix**: /api/v1
**Design catalog**: [operations.json](operations.json) | **Wire types**: [domain.schema.json](domain.schema.json)
**MCP mapping**: [mcp.md](mcp.md) | **Persistence rules**: [../data-model.md](../data-model.md)

## Contract ownership and serialization

This is the design contract for the implemented API. All 78 business operations (38 reads and 40 mutations) below have concrete input/output schemas in the catalog and map one-to-one to same-named MCP tools. Huma generates shipped OpenAPI from concrete Go DTOs; the frontend fetch SDK/types/Zod parsers are generated from that output. A contract compatibility check ensures the generated implementation fulfills this catalog. Do not hand-maintain a second runtime OpenAPI file or edit generated client code.

GET path fields are path parameters; scalar remaining fields are query parameters. PageRequest.limit/cursor flatten to limit/cursor. get_board.temporaryFilters is JSON in one documented query parameter and is decoded/validated into the typed filter. Read-only search POSTs use a typed JSON body. All mutations send Idempotency-Key as the caller's retryReference header; no second retry value appears in the REST body. Remaining mutation arguments are JSON, except upload_picture's multipart representation. Unknown JSON fields and unknown documented-filter members are rejected. MCP uses the exact input objects in the catalog.

IDs are UUID strings; revisions/issue numbers are positive decimal strings; timestamps UTC RFC3339; calendar dates YYYY-MM-DD; enums match domain.schema.json. Results never use null for a collection. JSON properties declared required are emitted even when their value is null. Required nullable fields are deliberate clear/set controls. Full PUT replacements must include all editable fields from a fresh read plus expectedRevision. Immutable fields are absent; issue status changes only through move_issue. Optional create fields use documented defaults from spec.md.

Every mutation returns {result: operationPayload, receipt: {eventId: UUID|null, replayed: boolean}}. The original domain payload and event identifier are preserved on a replay; only replay metadata may differ. Successful no-op/replay creates no extra business change/event. Creates use 201, other successful writes/read requests use 200; no-op duplicate label/dependency uses 200. A retry preserves the original result/status. Responses include a request correlation ID, never a credential.

## Authentication and visibility

Bearer access token from the configured Auth0 issuer with the REST audience (canonical service URL + /api) and gategoldjira:access scope. ID tokens, Google access tokens and tokens issued for /mcp are rejected. PostgreSQL rechecks active approved caller, effective project role, archival and ownership; the token is identity proof, not role authority. get_me returns only the caller's own identity/company calendar.

Public production endpoints are limited to /healthz (process health), /readyz (generic readiness status), and MCP OAuth protected-resource metadata. They contain no company records, counts, configuration secrets or raw errors. OpenAPI/docs endpoints are authenticated in production. CORS permits exact deployed Firebase origins and local development origins; reject unapproved origins, bind OAuth callbacks precisely and do not wildcard credentialed requests.

DEV-AUTH-001 adds `POST /api/v1/auth/local-sign-in` only when the backend uses guarded local development authentication. Its typed JSON request is `{username: string, password: string}`; success200 returns `{accessToken: string, expiresAt: UTC RFC3339 timestamp}` with a fresh one-hour REST-audience token. Unknown usernames and wrong passwords return401; a correct password for an inactive/unapproved fixture returns403; bounded login saturation returns503. Generated hashes are checked against fixed local fixture identities and current approval; this route cannot create accounts, accept an arbitrary actor or confer a role. Credentials and successful token responses must not be logged/cached. This authentication exchange is separate from the 78 business-action/MCP catalog and needs no idempotency header. Production and Cloud Run cannot enable it; programmatic local MCP clients continue using separately issued MCP-audience tokens.

Unknown and inaccessible resource IDs share unavailable_record /404. An authenticated caller forbidden from a known permitted context's action receives 403. Inactive/unapproved callers receive the generic account-inactive outcome without company content. Read/count predicates are identical. Administrator authority never exposes another user's notification inbox, and never allows editing another author's comment.

## Shared outcomes

All failure bodies use Failure: error {code,message,fieldErrors,retryable,nextAction}, nullable typed current authorized state, and nullable bounded unfinished-work page. No raw database/provider messages.

| HTTP | Code | Next action / behavior |
| --- | --- | --- |
| 401 | authentication_required | Sign in; for MCP include proper OAuth challenge |
| 403 | account_inactive / forbidden | Contact Admin or use permitted action; no records leaked |
| 404 | unavailable_record | Same result for unknown/inaccessible IDs, including images/inbox |
| 422 | validation_failed | Correct named fields; no partial change; sanitation alone returns success notice |
| 409 | conflict | Review current authorized entity/order/graph state; refresh and submit a new intention/reference |
| 409 | prerequisite_unfinished | Inspect bounded unfinished blockers/children, complete them or reopen required parent |
| 409 | retry_reference_reused | New reference for a genuinely different intention |
| 503 | temporarily_unavailable | Bounded backoff with SAME reference; ambiguous commit may already have succeeded |

A conflict can return relevant current graph/order revision in the typed current payload. Missing prerequisite lists remain paginated (25 default/100 maximum), with total and continuation to ordinary authorized reads; no unbounded 2,000-child error body. Completion rejections continue through search_issues using filters {projectIds:[current.summary.projectId], prerequisiteFor:current.summary.id, statuses:[todo,in_progress,review]} and the returned page cursor; omit the cursor to start a fresh traversal. Transport-malformed JSON returns 400 with the same safe validation structure. Over-limit upload/body returns 413 and validation outcome; transfer saturation returns retryable 503. Optimistic UI must not present any write as saved before successful commit.

## Operation catalog

All paths below include /api/v1 at runtime. Read-only POSTs require no idempotency reference and produce no audit.

| Operation / MCP tool name | REST route | Kind | Permission |
| --- | --- | --- | --- |
| `get_me` | `GET /me` | Read | approved active caller |
| `list_users` | `GET /admin/users` | Read | administrator |
| `approve_user` | `POST /admin/users` | Write | administrator |
| `update_user` | `PUT /admin/users/{userId}` | Write | administrator |
| `list_projects` | `GET /projects` | Read | approved active caller |
| `get_project` | `GET /projects/{projectId}` | Read | project reader |
| `create_project` | `POST /projects` | Write | administrator |
| `update_project` | `PUT /projects/{projectId}` | Write | administrator |
| `archive_project` | `POST /projects/{projectId}/archive` | Write | administrator |
| `restore_project` | `POST /projects/{projectId}/restore` | Write | administrator |
| `list_memberships` | `GET /projects/{projectId}/memberships` | Read | administrator |
| `set_membership` | `PUT /projects/{projectId}/memberships/{userId}` | Write | administrator; archived project allowed |
| `remove_membership` | `POST /projects/{projectId}/memberships/{userId}/remove` | Write | administrator; archived project allowed |
| `list_assignees` | `GET /projects/{projectId}/assignees` | Read | project reader |
| `list_mention_candidates` | `GET /projects/{projectId}/mention-candidates` | Read | project reader |
| `search_issues` | `POST /issues/search` | Read | approved active caller |
| `get_issue` | `GET /issues/{issueId}` | Read | project reader |
| `create_issue` | `POST /projects/{projectId}/issues` | Write | project writer; active project |
| `update_issue` | `PUT /issues/{issueId}` | Write | project writer; active project |
| `list_subtasks` | `GET /issues/{parentId}/subtasks` | Read | project reader |
| `create_subtask` | `POST /issues/{parentId}/subtasks` | Write | project writer; active project |
| `move_issue` | `POST /issues/{issueId}/move` | Write | project writer; active project and source board if supplied |
| `reorder_issue` | `POST /issues/{issueId}/reorder` | Write | project writer; active project and source board if supplied |
| `list_labels` | `GET /projects/{projectId}/labels` | Read | project reader |
| `create_label` | `POST /projects/{projectId}/labels` | Write | project writer; active project |
| `list_boards` | `GET /projects/{projectId}/boards` | Read | project reader |
| `create_board` | `POST /projects/{projectId}/boards` | Write | project writer; active project |
| `get_board` | `GET /boards/{boardId}` | Read | project reader |
| `list_board_cards` | `POST /boards/{boardId}/columns/{status}/search` | Read | project reader |
| `update_board` | `PUT /boards/{boardId}` | Write | eligible creator or administrator; active project |
| `archive_board` | `POST /boards/{boardId}/archive` | Write | eligible creator or administrator; active project |
| `restore_board` | `POST /boards/{boardId}/restore` | Write | eligible creator or administrator; active project |
| `list_dependencies` | `GET /issues/{issueId}/dependencies` | Read | project reader |
| `add_dependency` | `POST /issues/{issueId}/dependencies` | Write | project writer; active project |
| `remove_dependency` | `POST /issues/{issueId}/dependencies/{blockerId}/remove` | Write | project writer; active project |
| `list_comments` | `GET /issues/{issueId}/comments` | Read | project reader |
| `create_comment` | `POST /issues/{issueId}/comments` | Write | project writer; active project |
| `update_comment` | `PUT /comments/{commentId}` | Write | author with current write access; active project |
| `list_comment_versions` | `GET /comments/{commentId}/versions` | Read | project reader |
| `list_pictures` | `GET /issues/{issueId}/pictures` | Read | project reader; only caller's unexpired drafts |
| `upload_picture` | `POST /issues/{issueId}/pictures` | Write | project writer; active project |
| `get_picture` | `GET /pictures/{pictureId}` | Read | project reader for published; uploader plus current project access for draft |
| `download_picture` | `GET /pictures/{pictureId}/content` | Read | same current picture access |
| `detach_gallery_picture` | `POST /pictures/{pictureId}/detach` | Write | project writer; active project |
| `get_inbox_summary` | `GET /notifications/summary` | Read | caller recipient only |
| `list_notifications` | `GET /notifications` | Read | caller recipient only |
| `get_notification` | `GET /notifications/{notificationId}` | Read | caller recipient only |
| `set_notification_read` | `PUT /notifications/{notificationId}/read-state` | Write | caller recipient only; accessible project |
| `mark_all_notifications_read` | `POST /notifications/mark-all-read` | Write | caller recipient only |
| `list_activity` | `GET /admin/activity` | Read | Administrator for global/project activity; current project readers for paired issue resource kind/id, excluding private subscription and inbox history |
| `list_attachments` | `GET /issues/{issueId}/attachments` | Read | current approved project reader |
| `get_attachment` | `GET /attachments/{attachmentId}` | Read | current approved project reader |
| `upload_attachment` | `POST /issues/{issueId}/attachments` | Write | project writer; active project |
| `download_attachment` | `GET /attachments/{attachmentId}/content` | Read | current approved project reader |
| `detach_attachment` | `POST /attachments/{attachmentId}/detach` | Write | project writer; active project |
| `list_saved_searches` | `GET /issue-searches` | Read | accessible project reader; private caller-owned state |
| `save_issue_search` | `PUT /issue-searches/{searchId}` | Write | accessible project reader; private caller-owned state |
| `set_issue_link` | `POST /issues/{issueId}/links` | Write | project writer |
| `organize_issue` | `POST /issues/{issueId}/organize` | Write | project writer |
| `set_issue_watch` | `POST /issues/{issueId}/watch` | Write | accessible project reader; private caller-owned state |
| `reorder_backlog` | `POST /issues/{issueId}/backlog-order` | Write | current writable project member or administrator |
| `list_development_links` | `GET /issues/{issueId}/development-links` | Read | current accessible issue project reader |
| `save_development_link` | `PUT /issues/{issueId}/development-links/{linkId}` | Write | current writable issue project member or administrator |
| `get_issue_planning` | `GET /issues/{issueId}/planning` | Read | current accessible issue project reader |
| `set_issue_planning` | `PUT /issues/{issueId}/planning` | Write | current writable issue project member or administrator; epic/release belong to same project and expected kind |
| `get_notification_preferences` | `GET /notifications/preferences` | Read | approved active caller; private caller-owned preferences |
| `update_notification_preferences` | `PUT /notifications/preferences` | Write | approved active caller; private caller-owned preferences |
| `list_automation_rules` | `GET /projects/{projectId}/automation-rules` | Read | current accessible project reader |
| `save_automation_rule` | `PUT /projects/{projectId}/automation-rules/{ruleId}` | Write | administrator; current writable project; one enabled assignment rule per stage |
| `list_backlog` | `GET /projects/{projectId}/backlog` | Read | current accessible project reader |
| `export_issues` | `POST /projects/{projectId}/issues/export` | Read | current accessible project reader; scoped filtered export |
| `import_issues` | `POST /projects/{projectId}/issues/import` | Write | current writable project member or administrator |
| `preview_issue_import` | `POST /projects/{projectId}/issues/import-preview` | Read | current writable project member or administrator; read-only preview |
| `get_kanban_report` | `GET /projects/{projectId}/kanban-report` | Read | current accessible project reader; bounded UTC date window |
| `list_planning_items` | `GET /projects/{projectId}/planning` | Read | current accessible project reader |
| `create_planning_item` | `POST /projects/{projectId}/planning` | Write | current writable project member or administrator |
| `update_planning_item` | `PUT /projects/{projectId}/planning/{planningId}` | Write | current writable project member or administrator; planning item belongs to project |
| `list_planning_issues` | `GET /projects/{projectId}/planning/{planningId}/issues` | Read | current accessible project reader; planning item belongs to that project |

Admin approve_user creates a pre-approved active company account; no pending public signup is introduced. Initial Admin bootstrap is an owner-only local/operations CLI procedure outside the business API, never an anonymous route. Membership tombstones allow conflict protection on regrant. Query readers see assignee/mention summaries only, not email/admin details.

## Filters, boards and order

IssueFilter uses AND between supplied criteria: project scope, exact issue key, case-insensitive project-key prefix (for example `de` matches `DEMO-2`), or title substring, statuses, types, priorities, assignee any/unassigned/self/user, parent, direct prerequisites of prerequisiteFor, ALL label IDs, inclusive dueFrom/dueTo, overdue/not-overdue and blocked/unblocked. assignee.userId is required only for kind=user and forbidden otherwise; reversed date bounds fail. Missing criterion means unrestricted; supplied nonempty selection arrays contain unique values. A board filters only its own project; supplied projectIds must be absent or exactly that project.

Board saved and temporary filters intersect. BoardView returns one ColumnSummary object per configured stage with savedMatchCount, visibleMatchCount, warningLimit, limitExceeded and orderRevision. CardPage is bounded, ordered by shared rank and permanent issue number, with nextCursor/companyToday. Counts do not depend on rendered/loaded cards; WIP uses savedMatchCount only. The default board retains all-issues filters; an Admin can customize its workflow names, stage order, allowed moves and WIP limits. Archived board read is allowed, board-mediated move/reorder is denied until restore.

Issue reads include all current project stage order revisions so a detail-page status move does not need an implicit board lookup. A move checks issue and source/target order versions; a same-column reorder checks issue/order versions and real neighbor identity. When sourceBoardId is supplied, expectedBoardRevision is also required and that board must be active/current/accessible. This prevents stale saved-filter edits or an archived board from silently changing card state. WIP counts are returned for a supplied board after an otherwise valid mutation; warnings never reject completion.

All list portions have default 25, max 100 and a 1 MiB ordinary encoded-JSON payload budget. A content-heavy page may return fewer items than requested and continues after the last returned item; single valid records fit that budget. Signed opaque cursors bind caller, operation/filter/sort; do not contain permissions. Ordering: issue lists modified DESC/id DESC; comments oldest ASC/id ASC; inbox/history newest DESC/id DESC; board rank ASC/issue number ASC; other catalogs created ASC/id ASC (stable name-key/id for candidate/label selection). The unchanged-set guarantee applies across every portion. Order-revision changes invalidate board cursors and instruct reload.

## HTML, mentions and picture contract

CommentBody contains html, explicit mentionUserIds and pictureIds. Parsed references and submitted ID sets must match exactly (distinct IDs). A selected mention uses a canonical span with data-user-id and server-controlled display label; arbitrary @text remains plain text. An inline image uses an img with data-picture-id and escaped alt description. No src URL or base64 bytes are stored in comment HTML. The compatible rendering adapter resolves the ID through authenticated image access.

Allow p, h1-h6, strong/b, em/i, u, ul/ol/li, blockquote, br, a with HTTP/HTTPS href, validated mention spans, and same-issue uploaded image nodes. Keep only agreed attributes: dir auto/rtl/ltr on supported text blocks, validated reference IDs and safe image description. Strip scripts/styles/event attributes, arbitrary classes/CSS, remote/data image sources and unsupported tags before save; return sanitationNotices. Derive plainText from canonical nodes, preserving readable mention labels, line breaks and picture descriptions. Enforce 64KiB formatted bytes, 5000 visible Unicode characters and five inline pictures after canonicalization. Reject content empty after cleanup without a valid picture.

New mentions require current eligible active approved readers; existing version mentions may remain after loss of access. Versions retain all old references/HTML/text/direction. Notification recipients follow the spec table, never supplied arrays of recipients. Arabic text is preserved; direction and bidi isolation are rendering controls rather than text rewriting.

REST upload_picture sends multipart file and typed metadata JSON {filename,description,mimeType,publication} with Idempotency-Key. Stream to a private immutable object/reservation; cap decoded bytes at 10MiB, match the actual PNG/JPEG/WebP signature/structural header and declared MIME, validate checksum and completeness. Do not fully decompress an unbounded bitmap merely to store it; no thumbnail processor is needed for the MVP. Never persist file bytes in HTML or instance-local storage.

comment_draft output is private to its uploader with current access, expires exactly 24h, and cannot be embedded until upload confirms. Saving a comment atomically validates and publishes referenced complete drafts. gallery publishes immediately after a confirmed object and metadata commit. Failed uploads/saves preserve unsent editor text in the current editing session. No accessible half-file or broken comment reference.

REST /pictures/{id}/content checks access every request and streams with correct MIME, Content-Disposition using a safely encoded filename, X-Content-Type-Options:nosniff and Cache-Control:private,no-store. A copied URL carries no authority. Fetch authenticated blobs lazily and release browser object URLs on teardown/revocation. Do not store picture bytes in a service-worker cache; do not issue public/signed download URLs. Content already downloaded cannot be recalled, but a new read after revocation is denied.

## Notifications, history and compatibility

A successful mutation records one event identity and relevant affected-resource audits; derived affected issues share the event for notification dedupe. Notifications are inserted in the same transaction as the change, available on the next read. GET notification is pure; the web's Open action explicitly calls set_notification_read and updates displayed read state only on success. MCP clients may perform the same pair. Mark-all-read affects currently accessible entries at its transaction snapshot only; inaccessible entries contribute nothing to counts.

Activity returns safe typed FieldChange entries (field/before/after display values) and a plain-text summary; persisted versioned changes retain complete business values. Personal read-state audits expose actor/action/resource/time plus read-state metadata only, not private notification text.

API /v1 permits additive optional response fields with regenerated validators tolerant of those additions; inputs still reject unknown fields. Keep backend compatible with the deployed frontend, deploy backend first, and add required fields/breaking enums only via a new version or documented compatibility window. The strict design schemas define required known payloads; implementation response-validation compatibility must deliberately support additional future fields rather than turning a harmless additive release into a browser outage.


## Issue document attachment routes (contract 1.1, additive)

| Operation | Route | Behavior |
| --- | --- | --- |
| list_attachments | GET /issues/{issueId}/attachments | Current attached documents,25 default / 100 maximum, stable cursor |
| get_attachment | GET /attachments/{attachmentId} | Protected metadata, current reader |
| upload_attachment | POST /issues/{issueId}/attachments | Multipart JSON metadata `{filename,mimeType}` plus one file; Idempotency-Key |
| download_attachment | GET /attachments/{attachmentId}/content | Authenticated immutable bytes; attachment disposition |
| detach_attachment | POST /attachments/{attachmentId}/detach | JSON `{expectedIssueRevision}` plus Idempotency-Key; active writer/CAS |

Allowed types are application/pdf, text/plain, text/csv, application/vnd.openxmlformats-officedocument.wordprocessingml.document and application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, with matching .pdf/.txt/.csv/.docx/.xlsx extension and validated bounded containers. Office ZIPs require matching content-type and XML root, valid CRCs, no macros/encryption and no more than 100 MiB total expansion. Maximum file bytes remain 10 MiB. Downloads always set Content-Disposition: attachment (encoded safe filename), Cache-Control: private,no-store and X-Content-Type-Options: nosniff. Documents are never rendered as inline HTML or images. Private storage and permission/retry paths are shared with current infrastructure; no new service or bucket is introduced.


## Planning, Kanban reports and development links (contract 1.2)

`list_planning_items` accepts optional kind (`epic` or `release`) and a cursor page. Members and Administrators create/update planning records with name, plain description, nullable calendar target date and status (`planned`, `active`, `complete`). Kind remains immutable. Updates require the record revision. A planning-record conflict returns typed current authorized `PlanningItemView` for review. Status is a planning decision; the derived completed count comes from linked nonarchived issues in a completed workflow category.

`get_issue_planning` and `set_issue_planning` use a separate assignment revision: `"0"` before the first saved association, then positive decimal strings. Every replacement supplies nullable `epicId` and `releaseId`; null clears the association. Both records must belong to the issue's project and match the expected kind. This preserves Task/Bug/Subtask issue types and isolates planning changes from the issue's editable-field revision. `list_planning_issues` returns a stable issue-number page with current permission filtering.

`get_kanban_report` requires `from` and `through` query parameters formatted as YYYY-MM-DD. The inclusive UTC date window has a maximum 366 days; start after end is invalid. Completion episodes and cycle durations come from retained status transition events. Initial In progress/Review creation starts a measured cycle; initial To do followed directly by Done counts throughput without inventing a start. The first In progress/Review transition starts a cycle; returning to To do retains that clock. Reopening Done starts another episode and a later completion counts again. A completed episode with no recorded start is excluded from the average, which is null when no measured episodes exist. `updatedAt` never substitutes for a transition.

Report `days` is bounded by the date window. `work` is separately paginated by permanent issue number and contains current nonarchived, nonbacklog unfinished work, current direct unfinished-blocker counts, creation age and nullable recorded cycle age. `snapshotAt` identifies the live observation; independent REST and MCP reads can have different ages by exactly the elapsed observation time. Archived projects remain readable under current access.

`save_development_link` creates with `expectedRevision:"0"` and a client-generated link UUID, then uses positive revision CAS for edit/removal. Required replacement fields are title, URL, kind (`pull_request`, `commit`, `other`) and removed. URLs must be absolute HTTP/HTTPS with a host and no embedded credentials/control characters. The service stores a manual reference and performs no request to that URL. Removal is a retained tombstone; the ordinary list hides removed entries. Current project writers can change links on active issues; readers can list them.

`save_automation_rule` is Administrator-only. A rule names a registered project stage and currently eligible assignee; one enabled assignment rule may exist per stage. Create uses a rule UUID and revision 0; update/disable uses CAS. Disabled rules can retain an inactive assignee or retired stage so Administrators can clean up old configuration. Rule application is a callback inside the same create/move transaction, after normal workflow and prerequisite checks. Current assignee eligibility is rechecked, inactive rules/assignees are skipped, and actual reassignment records an attributable audit plus assignment notification. Replaying a command applies no extra rule event. Pending backlog issues apply the rule only when activated.
