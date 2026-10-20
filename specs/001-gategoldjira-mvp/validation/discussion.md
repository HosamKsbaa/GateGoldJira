# Local discussion and private-picture checkpoint

Verified 2026-10-12 with PostgreSQL 18.6, Chromium 156 and local signed development identities.

- The comments and pictures Go race suites pass. They cover sanitization, Unicode/byte limits, thirty Arabic/mixed-identifier fixtures, current access and author-only updates, retained versions, atomic exact references, upload retry/recovery, draft expiry and private downloads after revocation.
- REST multipart and MCP base64 parity passes, including a full 10 MiB picture, restart, cross-channel retry receipts, immutable historical bytes and malformed/oversized input rejection.
- Both discussion browser tests pass in `.local/browser-tests/8489021a43b846669fb14125aee06fd4`. The author keeps formatted Arabic text through a committed upload whose response is lost, retries once, publishes the picture, edits the comment and reads its old picture-containing version. Viewer reads and unauthenticated downloads are checked. The other case renders sanitized headings, emphasis, links, lists and blockquotes without remote image requests.
- Fixed an SDK binary-schema mismatch with feature-owned Blob validation; generated sources stay generated. Private editor previews ignore DOM mutations, preserve selected text on insertion and revoke object URLs on disposal.
- Strict Angular application/template/test compilation and 48 frontend unit tests pass. Production build passes at 764.72 kB initial raw / 164.92 kB estimated transfer; its 600 kB warning remains for final performance work. Editor dependencies are lazy loaded.

Selected mention selection/inbox screens, actual Auth0/assistant OAuth and cloud storage/recovery/performance gates remain later tasks. This checkpoint does not claim full MVP completion.

Final maximum-picture transport proof: `backend/tests/parity/maximum_picture_test.go` passes through official SDK1.8.0, exact10MiB both directions, one base64 field and complete response below16MiB. Actual selected assistant/managed OAuth remains pending.
