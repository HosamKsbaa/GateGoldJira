# Actual assistant workflow acceptance

Status: all50 typed providers and26 mutations pass local Go-SDK/REST catalog checks. Actual Auth0 Google login and a selected assistant/client/version are unavailable; zero of the actual-assistant sessions below have run. Do not count SDK fixture sessions as SC-004 assistant acceptance.

Record assistant product/version, MCP protocol negotiated, manually registered public client/CIMD metadata, exact callback, issuer/resource/scope and build/region. Use approved human users and explicit delegated test actions. Do all writes through MCP, then verify saved values using a subsequent read-only browser visit. Save event/resource IDs and redacted status outcomes only; do not save codes, tokens, PKCE verifiers, cookies, secrets or duplicated base64. Every one of the20 sessions repeats the full SC-004 sequence: find project; create filtered board and issue; assign; link and resolve blocker; set date/labels; create and complete child; move through Review; configure and exceed WIP; post formatted Arabic with a picture and selected mention; read personal inbox; then verify all saved values in a read-only browser visit. The table adds a focus/variation to that complete sequence; it does not split the required actions across20sessions.

Each session begins with actual OAuth S256/discovery/consent or an established approved session and ends with browser confirmation.

| Session | Additional focus / required observable result | Actual result |
| --- | --- | --- |
|01|Get me, list projects, select authorized project and create an Arabic issue; reporter matches human|Pending|
|02|Search mixed Arabic/key text, assign existing issue to eligible teammate; My Issues matches|Pending|
|03|Update description/priority/date/labels; retry exact save; only one event|Pending|
|04|Create named filtered Kanban board; list four columns and bounded cards|Pending|
|05|Move issue to In progress, then Review; shared board order survives next browser read|Pending|
|06|Set Review WIP limit2; move third matching card; success carries textual warning|Pending|
|07|Reorder with hidden cards; second board preserves shared relative order|Pending|
|08|Add A blocked by B; Done attempt identifies unfinished B; finish B then explicitly finish A|Pending|
|09|Reopen blocker; dependent stays put and blocked/unblocked transition is visible|Pending|
|10|Reject self/cross-project/combined hierarchy cycle without partial changes|Pending|
|11|Create one-level assigned child with independent fields; progress updates without automatic parent completion|Pending|
|12|Attempt parent Done with unfinished child; finish children then explicitly complete parent|Pending|
|13|Create supported rich HTML Arabic/bilingual comment and selected teammate mention; browser direction and sanitized formatting match|Pending|
|14|Edit own comment; old version persists; old mention does not notify again; newly added mention does|Pending|
|15|Upload private1MiB PNG, embed in comment, download through authorized MCP and browser|Pending|
|16|Upload exact10MiB supported image once; transport<=16MiB and selected assistant handles it; subsequent protected download works|Pending|
|17|Detach gallery image while old comment retains reference; other author cannot edit|Pending|
|18|List own inbox/count, get one item, read/unread/mark-all; other inbox and revoked project counts stay hidden|Pending|
|19|Admin approve/role/revoke/archive/restore; old token/retry cannot bypass current permissions; history remains|Pending|
|20|Lost save response, cross-instance retry, stale revision and Viewer denial; fresh browser read matches durable result|Pending|

For each actual session record start/end time, user role pseudonym, exact operations, expected/actual outcome, browser-confirmed resource/event IDs, screenshot/report path and failure correction. Reject wrong audience, ID token, expired token, unknown client or unapproved identity. Record actual max-picture capability; reduce no required scope to make a client pass. US6's final external checkpoint and T135 remain unchecked until20 complete sessions satisfy these conditions.
