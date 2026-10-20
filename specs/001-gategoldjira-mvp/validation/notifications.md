# Local selected mentions and private inbox checkpoint

Verified 2026-10-12 with isolated PostgreSQL18.6, the official Go MCP SDK1.8.0 and Chromium156. Local fixtures use signed one-hour human identities; no Auth0 tenant is configured.

- All50 REST and MCP providers are registered. The mandatory full PostgreSQL Go race suite and vet pass. Generated-contract drift and feature import boundaries pass.
- Arabic typing of `@`, bounded teammate candidates, arrow keys/Enter, identity chips, server-controlled labels and unselected plain `@text` pass in Chromium. A Viewer can receive a selected mention and manage only their own inbox. Historic mentions remain editable after their recipient loses access and are not notified again.
- Own-only list/get/counts, newest-first keyset traversal, exact reason unions, actor exclusion, read/unread revisions, stale/no-op behavior, mark-all, lost-response retry with the original reference, REST/MCP replay and restart pass. Unknown, foreign and inaccessible notifications share the same unavailable response, including for Administrators.
- Actual due-date, comment/create/edit, blocked/unblocked, new-subtask and last-child-completion commands produce the expected recipient/reason sets. Existing roles deduplicate. Label-only changes, pictures, failed commands and inbox state changes produce no notification loop. Atomic event/inbox/retry rollback is tested.
- Mark-all excludes revoked projects. Twenty races against the real membership-removal command pass without leaking a revoked list/count. One hundred producer transactions produce exactly100 notifications for each eligible recipient, with all nine reasons unioned, and every next read sees its committed event. Local p95 next-read time was52.953ms (max78.286ms); this is not a Cloud Run measurement.
- Browser evidence: `.local/browser-tests/a9a9f9a366bf45b0a8c24e1e4effa08b`,2/2 passed. Strict Angular app/template/test compilation and50 unit tests pass. Production build passes at765.92kB initial raw/167.83kB estimated transfer; it exceeds the600kB warning budget and remains below the1MB hard limit. Rich editor and inbox routes load lazily.

The full operation/retry matrix, scale tests, actual assistant OAuth workflows, employee usability, cloud deployment/performance and recovery remain separate release gates in tasks.md.
