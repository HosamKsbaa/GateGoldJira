# Contract evolution

All actual OpenAPI/TypeScript/MCP schemas are generated from explicit Go models. This file specifies the evolution; generated outputs are not edited manually.

## First compatible operations

- `PATCH /api/v1/issues/{issueId}/fields` / `patch_issue_field`: a checked field discriminator plus concrete prior/value slots for assignee, priority or due date; one field only, original retry reference, current typed issue result. No generic map/JSON-patch payload. Stale target prior values return an explicit current issue conflict. Full PUT retains expectedRevision behavior.
- Existing issue/board search operations keep pagination and totalMatching semantics while replacing internal query classification/predicates. A count-free live-search result is explicitly versioned, with items/hasMore/nextCursor and no invented total.

## Modern typed operations

Versioned configuration/workflow, issue snapshot/create/update/move, board layout/cards/reorder, typed custom value, approval vote/resubmit and attachment-session operations use named UUID IDs and checked behavior/category/kind values. Runtime taxonomy is data, not a compile-time enum list.

Old operation/input canonicalization and replay models stay unchanged. New operation identities distinguish new typed commands. Unsupported older editor calls return upgrade guidance when a project leaves legacy-representable mode. Web and MCP call the same services and current permission checks.

## Behavior requirements

Project admin may configure only authorized projects. Defaults and retirement are atomic. Ambiguous grouped-column drop includes a selected stage; all guards are server-owned. Approval decisions include expected context and distinct eligible voter identity. Upload URLs/sessions do not accept client-selected trusted storage keys/MIME/generations. Responses remain bounded, typed and credential-free.

Existing parity/catalog tests are extended for new operations; current OAuth/provider tests remain separate external acceptance.
