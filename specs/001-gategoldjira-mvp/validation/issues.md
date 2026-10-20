# Local issues checkpoint

Verified 2026-10-12 against isolated PostgreSQL 18.6 databases and Chromium.

- Eight combined account/project/issue browser cases passed. Issue cases cover Arabic plain text, eligible assignment, My Issues, exact-key search, visible stale conflicts, fresh replacement, null clears, 200/201 emoji limits, Viewer restrictions and original-reference retry after a committed response is lost.
- Full Go race suite and vet passed, including concurrent unique numbering, cross-channel retry/event identity, assignment notifications, Subtask identity, Unicode boundaries, all unchanged search portions and date/label/parent/blocker intersections.
- Strict application/template/test compilation and 34 frontend unit cases passed. Runtime payloads match the design catalog, including required nulls, capability enums and bigint-string revisions/numbers.
- Generated-contract drift and feature import boundaries passed. The production frontend builds at 724 kB initial raw / 155 kB estimated transfer; the 600 kB warning remains open for final optimization, below the 1 MB hard limit.
- Current account checks precede resource resolution. Unauthorized issue IDs share unavailable outcomes; full replacements cannot modify reporter, project, identifier, parent or status.

Local restart checks instantiate a fresh service against persisted records. Production restarts, Auth0, Google Cloud, actual assistant workflows and employee usability remain later acceptance gates. This checkpoint is not full MVP completion.
