# Issue comments and attachments validation

Verified 2026-10-12. UX-006, UX-007 and ATT-001–ATT-003 are implemented locally. Tasks T161–T166 extend the existing feature-first Angular/Go applications and shared PostgreSQL services.

## Delivered behavior

| Requirement | Implementation and evidence |
| --- | --- |
| UX-006 | Clicking card padding or an issue-table status cell opens the issue through a native link. Enter still opens the title link. Card-body/title dragging, parent links, move controls, keyboard order, blocked Done and WIP warnings retain their existing behavior. Navigation is suppressed during card dragging. |
| UX-007 | Comments and attachments follow the description. Add comment focuses the rich editor; Attach picture and Add attachment focus their file controls. Section buttons move focus to discussion/attachments. Arabic comments and filenames render with direction isolation, and uploading/removing files preserves the comment draft. |
| ATT-001 | Private PDF, UTF-8 TXT/CSV, DOCX and XLSX attachments up to 10 MiB each; existing PNG/JPEG/WebP gallery and inline comment pictures remain available. Matching filename/type and bounded content validation reject malformed input. Office containers require valid XML/ZIP contents, reject macros/encryption, and limit expanded size to 100 MiB. Documents download rather than render as HTML. |
| ATT-002 | Five typed REST/MCP operations share one attachment service. The catalog now has 55 business operations and 28 mutations. Current project/account permissions govern every read/write; Viewer can download but cannot upload/detach. Upload retries have one durable effect, list pages are bounded, detach checks the issue revision, and audit history records attachment changes. Detached bytes remain retained and require current access when downloaded by ID. |
| ATT-003 | Upload failures retain the selected file, retry reference and unsent comment. A stale detach refreshes the issue and requires an explicit review/retry. Immutable private object generations and bounded failed-stage cleanup use the existing storage configuration. The frontend and backend remain separately built, statically typed applications. |

## Executed checks

- Strict Angular app/templates and TypeScript unit/browser-test compilation: pass.
- Frontend units: **79 pass across 13 files**, including 12 new attachment file/binary-contract cases.
- PostgreSQL-required backend suite: `TEST_DATABASE_URL=… REQUIRE_POSTGRES_TESTS=1 go test -count=1 ./...` passes. `go vet ./...` passes. No connection credentials are included in this report.
- Targeted race checks: `go test -race -count=1 ./internal/features/attachments ./internal/features/activity` pass. Seven attachment tests cover supported/invalid formats, current permissions/revocation, private retained downloads, retry identity, REST/MCP parity, pagination, paused cleanup and failed-stage cleanup.
- Catalog/transport checks pass with all 55 operations and 28 saved mutations replaying across MCP/REST after restart. MCP discovery traverses the second tool page.
- Generated SQL/OpenAPI/TypeScript/Zod reproducibility: `bash scripts/check-generated.sh` passes without drift. `python3 scripts/check-architecture.py`, with the project tool environment loaded, passes.
- Full isolated PostgreSQL/Chromium run `.local/browser-tests/96c789773d9d401f8f979c0ac9b46fb7/`: **35 pass, one opt-in timing case skipped, one existing account-access case exceeded its five-second wait** while compilation was running. Its API requests succeeded; recorded response time exceeded the UI test wait.
- Focused final run `.local/browser-tests/ad5b7ec1341842b09b1bedfeebcb4be7/`: **five pass**, covering that account-access case and all four new issue-workspace cases. Across the two runs, **37 distinct cases pass**, with the opt-in timing case skipped. No timeout or acceptance threshold was increased.
- Browser checks use the real API and a disposable database: card/row opening, editor focus, Arabic comments, PNG upload, Arabic-named PDF/TXT upload/download, Viewer restrictions, 390px layout, lost-response upload retry without duplicate files, and stale detach with explicit retry/private retained content.
- Production Angular build passes the unchanged 1 MB error budget. Initial output is **849.49 kB raw / 184.70 kB estimated transfer**; the existing 600 kB warning remains. This is not a new cloud performance measurement.

The inspected screenshot is `.local/browser-evidence/issue-comments-and-attachments.png`; it shows the Viewer view with Arabic discussion, pictures and downloadable documents. The live-tab control tool rejected access, so UI acceptance used the project's isolated Chromium runner rather than direct control of the user's tab.

## Local rollout and remaining gates

The preserved local PostgreSQL volume was restarted and additive migration `00004_attachments.sql` applied successfully with `make db-migrate`. The final backend was rebuilt and restarted on `127.0.0.1:21080`; Angular remains on `http://localhost:4201`. Health/readiness, Owner password sign-in, current-user read and attachment listing return 200. Browser fixtures use separate databases and do not add test issues/files to the user's project.

For other environments, apply the additive migration with the separate migration identity, release the compatible backend, then release the frontend. Roll back applications before schema changes; do not run destructive down-migrations over retained company data. Private attachments use the existing storage provider and maintenance configuration. The storage-cost forecast must include retained documents as well as pictures.

The eight existing external identity, assistant, employee-study, billing, cloud deployment/performance and recovery tasks remain pending in [readiness.md](readiness.md). This local feature does not complete those release gates.
