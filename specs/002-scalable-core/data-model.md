# Data model and migration ownership

Authoritative conceptual target: [reviewed V2](../../docs/database/proposed-v2-design.txt), [core diagram](../../docs/database/proposed-v2-core.puml). The target's complete 44-table inventory is retained; the applied migration-00010 schema is the baseline, not a proposal file.

## Typed core

Configuration owns workflows/stages/transitions, types, priorities, allowed bindings, defaults and retirement. Issues store same-project type/priority/workflow/stage references; core fields remain columns. Composite FKs reject invalid type/workflow or workflow/stage combinations. Used kind/category/ownership values are immutable. Stage intake can close before bounded migration/retirement. Default-board coverage and active creation defaults are configuration-transaction invariants.

Boards own column names/order/mappings, explicit column warnings/hard limits and per-board ranks. Each stage maps at most once per board. Ranked/unranked cursor phases remain live views; test both first and empty terminal pages. Hard filters are restricted to deterministic issue-owned fields and every occupancy-changing command participates.

Fields own a checked value kind and choices; values use exactly one typed non-null slot. Approvals retain issue/workflow/configuration revision snapshots; votes do not mutate content, while explicit resubmit advances the existing content revision. Rules/visible attachment changes invalidate appropriate context. Ordinary no-op saves retain revisions/events.

Attachments own image/file kind, draft/published/expired state and private byte identity. Sessions own actor/retry canonical hash, reserved asset ID, lease, staging generations, upload mode/size and publication intent. Comment versions retain same-issue asset references; detach is panel visibility only.

## Transition from old schema

Expansion migration adds nullable canonical references/tables and indexes without deleting old columns. Bridge writes keep old/new representations synchronized before bounded backfill. Backfill checks legacy values/revisions and does not invent content events. Current subtask parent CHECK/identity trigger needs an explicit behavior-aware replacement before old text type is retired. Do not drop old status/type/rank/JSON/media structures until all SQL consumers and supported contracts have switched.

Preflight checks both active and archived boards, retired tokens, saved filters, old retries, rule references and cross-table asset identities. Preserve old event category tokens so existing planning reports retain meaning. New tables receive runtime grants.

Historical object keys, bytes and immutable HTML are retained; no media rewrites or migrations infer physical object publication time. Cleanup only deletes verified unreferenced temporary generations under lease rules.
