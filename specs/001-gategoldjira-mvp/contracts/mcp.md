# MCP Contract

**Endpoint**: canonical Cloud Run service URL + /mcp
**SDK**: official Go MCP SDK 1.8.0; Streamable HTTP, stateless, JSON responses.
**Tools and schemas**: every operation in [operations.json](operations.json); [domain.schema.json](domain.schema.json).
**Shared behavior**: [rest-api.md](rest-api.md), [../data-model.md](../data-model.md).

## Connection and human identity

Implement authenticated initialize/discovery/calls through SDK middleware. No company data is available without a verified active approved user. Public RFC9728 protected-resource metadata at /.well-known/oauth-protected-resource/mcp advertises resource equal to the canonical /mcp URL and the Auth0 issuer. A 401 includes WWW-Authenticate Bearer with resource_metadata URL; AS discovery comes from Auth0, not a homemade Go authorization server.

Register the reference public test client with Auth0 using Authorization Code + S256 PKCE and exact redirect URI. Enable resource parameter compatibility so the requested MCP resource gets the dedicated MCP audience. REST and MCP have distinct audiences and the same trusted human issuer/subject mapping. No ID-token/Google-token passthrough, client-credentials impersonation, caller-ID argument or token in tool parameters/URLs. Only human user-delegated tokens are accepted. Signing-key caching is allowed; current account/project/ownership state is read from PostgreSQL every call.

Initial registration policy is manually pre-registered clients or manually imported public CIMD. DCR stays off unless a selected client requires it; then configure the managed issuer's domain-level connection and delegated grants, and test it before rollout. Registering a client never grants company account approval. The initial Go-SDK validation harness is a public registered OAuth client. Record the chosen assistant client and version, then verify its auth and maximum-picture support for SC-004; building an assistant is outside scope.

Support SDK protocol 2026-07-28 and compatible 2025-11-25 clients. Allow a 30-second transport deadline covering body reading and picture serialization; ordinary tool service calls narrow it to five seconds, while picture calls retain the transfer deadline. No server-initiated sampling, subscriptions, resumable streams, sticky sessions or in-memory business state. Verify initialization and tool execution across different backend instances and after restart.

## Tool shapes, results and annotations

The 78 operation IDs are the exact tool names. Each catalog entry defines a concrete typed input object, success output, failure type, permission and mutation status; there is no generic run_query, arbitrary SQL, generic action map, send_notification or act_as_user tool. Common rules, limits, full replacement semantics and filter serialization meanings match REST.

Use generic AddTool registration with Go command/result types. Publish explicit inputSchema/outputSchema and additionalProperties=false for action arguments; validate business rules in the shared service. Published schemas are self-contained with local definitions, never requiring a client to fetch these planning files. Typed inputs are copied into canonical service commands; SDK dynamic protocol fields remain at the transport boundary. Administrative userId arguments identify the account being managed, never the caller.

For a read tool the successful output is its catalog payload. Mutation success is {result,receipt}; retryReference is required directly in the input. Set readOnlyHint according to the catalog. Mutations are idempotent with their required retry reference; archive/remove-reference tools still annotate potentially destructive changes honestly. openWorldHint=false: no arbitrary external network target, email or notification recipient override. Annotations are descriptive, never authorization.

The published MCP output schema is a typed discriminated envelope:
- Success: {ok:true,data: CatalogSuccess, error:null}.
- Failure: {ok:false,data:null,error: Failure} with isError=true.
Go uses concrete generic Result[OperationOutput] plus a concrete Failure, with schema constraints requiring exactly the appropriate nullable branch. This encompasses both results in one declared schema; it does not substitute an untyped map. For ordinary success provide readable concise TextContent and structuredContent. For picture download, explicit short TextContent avoids the SDK's default full JSON text serialization duplicating the base64 payload.

Account-created personal MCP tokens are an additional human credential accepted only by `/mcp`. Users manage their own tokens through authenticated REST account endpoints, never through assistant tools. Only hashes and lifecycle metadata are stored; tokens have no expiry, can be revoked, and always use the owner's current approval and project permissions. They do not authorize REST requests or change the business operation catalog.

Successful issue, project, board and comment results also include an optional typed `links` array of `{url,title}`. Routes come from the owning feature's authorized result, and absolute URLs use the configured application URL (falling back to the first allowed application origin). The JSON text fallback includes these links so assistants can display clickable results. Retries retain the same resource URL; failure envelopes expose no links.

Protocol errors (invalid JSON-RPC/missing tool) follow SDK protocol handling. Authentication failures remain HTTP OAuth outcomes. Application validation, unavailable records, conflict, unfinished prerequisites and temporary failure use the shared Failure code/nextAction without leaking unauthorized records. Conflict/current state and prerequisite lists stay typed and bounded.

## Retry, cancellation and stale data

All mutation inputs carry retryReference and the applicable entity/graph/order versions declared in the catalog. Client retains the same reference/arguments after an interrupted response or temporary failure. An intentional revised command uses a fresh reference after reviewing conflict state. The caller-scoped canonical hash is transport-independent, enabling REST/MCP retry parity for the same operation.

Context cancellation and timeouts propagate through auth/service/sqlc/storage. Do not claim cancellation guarantees rollback if commit may already have happened; the next step is retry with the same reference. Check current permission before replaying a committed result. A revoked Member or disabled account cannot replay its old write to regain access.

Tool discovery may expose static tool descriptions to an authenticated approved user, but cannot include issue IDs, candidate identities or personal counts. Tools remain callable only under current service permissions; hiding a tool is never the sole security rule.

## Pictures, formatted comments and Arabic

upload_picture accepts upload metadata plus one dataBase64 field, publication comment_draft or gallery, issueId and retryReference. Strict base64 decode and validate actual bytes/MIME, <=10MiB, complete checksum and description before a successful result. It uses the same upload service/reservation/publication logic as multipart REST.

download_picture returns typed metadata and one dataBase64 field after current authorization; get_picture/list_pictures return metadata only. Set MaxRequestBodyBytes=16MiB (SDK default4MiB is insufficient); cap outgoing envelope at16MiB. A 10MiB file encodes to13,981,016bytes. Acquire the shared two-transfer semaphore before large input decode/download buffering, including unknown-length request bodies, and return retryable busy rather than retaining an unbounded queue. No image bytes or access tokens in logs. No duplicate base64 TextContent/ImageContent serialization.

The reference client must accept the declared payload sizes; clients with smaller limits can read metadata and ordinary tools but do not qualify for the full image acceptance workflow. Long-term alternate chunk transport requires a separate reviewed contract change; it is not implemented speculatively.

create_comment/update_comment use supported HTML with explicit matching picture and mention ID sets. Return canonical safeHtml, plainText, direction metadata in HTML, validated mention labels, sanitation notices and picture references. A non-HTML client reads plainText and retrieves the referenced picture. Picture-only comments are valid with a valid descriptive inline node. Arabic text is never translated or rewritten. Bidi handling comes from canonical block direction and display isolation.

## Parity acceptance

Use table-driven fixtures to run every catalog permission/validation case through REST and tools. Compare saved state, actor, audit event set, retry replay, order/graph versions and inbox ownership. Include Viewer and inactive/removed membership cases; wrong-audience tokens; archived boards/projects; comment-author ownership; Arabic round trips; last Admin; hidden-card ordering; parent completion/cycles; newly added mentions and duplicate recipient roles.

SC-004 requires at least20 complete assistant workflows including administration where appropriate, boards/WIP, issue assignment, blockers, dates/labels, child completion, Review, Arabic formatted comment/picture/mention, and inbox read state. Verify the next browser read observes every saved result. No network service or OAuth tenant is created by this planning artifact.


## Document attachment tools (additive contract 1.1)

`list_attachments`, `get_attachment`, `upload_attachment`, `download_attachment` and `detach_attachment` call the same attachment services as REST. Tool discovery remains paginated at 50 per response; follow `nextCursor` to retrieve all 78 business tools. Upload accepts `{issueId,upload:{filename,mimeType,dataBase64},retryReference}`; MIME/extension/bytes must agree for PDF, UTF-8 TXT/CSV, non-macro DOCX or XLSX, maximum 10 MiB. Metadata reads expose no object coordinates. Download returns `{attachment,dataBase64}` with one bounded byte field and short text. Both transfers share the existing two-transfer gate and 16 MiB transport budget.

Only current writers in active projects can upload/detach; current readers can list/get/download, including retained detached content by ID. Upload advances the issue revision; detach takes `expectedIssueRevision` and uses CAS. A changed revision returns `conflict/reload_current_state`; an uncertain response retains its original reference. Successful upload/detach audit records use resource kind `attachment`; no credentials, document bytes or object coordinates enter audit/log output. Pictures and inline-comment references continue using their original separate tools.


## Planning and integrations (contract 1.2)

The planning tools are `list_planning_items`, `create_planning_item`, `update_planning_item`, `list_planning_issues`, `get_issue_planning`, `set_issue_planning` and `get_kanban_report`. The integrations tools are `list_development_links`, `save_development_link`, `list_automation_rules` and `save_automation_rule`. Every tool invokes the same concrete typed service as REST; current project access, archival, kind validation, Administrator-only rule management and saved retry receipts are transport-independent.

Planning inputs use typed UUIDs, calendar date strings and explicit nullable associations. New association/link/rule revisions are `"0"`; existing revisions are positive decimal strings. Writes require the exact retry reference from the original intention; a REST save can be retried through MCP and returns the same saved result and event. Readers can fetch report/planning/link pages, but ordinary Viewers cannot mutate company planning or links. Personal notification-preference changes remain available to their current recipient, including Viewers.

Kanban report input requires the same bounded inclusive UTC `from`/`through` window as REST and a page for current work. The output distinguishes measured completion episodes from unmeasured completions and includes the timing definition. Live ages are derived from `snapshotAt`, recorded starts and creation, so successive observations legitimately advance without a company mutation. Manual development URLs are stored without network calls, keeping `openWorldHint=false`. No provider secret, repository token or external webhook is part of these tools.

The complete catalog is 78 operations, 40 mutations. Discovery still uses the SDK's bounded 50-tool page, so clients follow `nextCursor`. Contract and real-service parity tests cover every catalog ID plus each mutation's exact saved replay, permission-denied cases and instance replacement. Browser acceptance for these additions uses isolated project fixtures and the generated typed SDK.

Every registered tool call using a personal token creates an owner-only activity record before execution, including schema validation failures. Activity records contain tool names, timestamps, outcome/error code and returned resource links, without arguments, response bodies, uploaded bytes or secrets. REST-only paginated activity history remains available after revocation. A missing completion record is explicitly unconfirmed.

Local development can delegate to the loopback OAuth adapter described in `specs/003-mcp-browser-oauth/`. Its issuer is distinct from the development JWT fixture issuer. Protected-resource metadata must advertise the reachable OAuth issuer, while existing web JWT validation keeps its configured issuer/audience. Production continues to delegate to its managed identity provider.
