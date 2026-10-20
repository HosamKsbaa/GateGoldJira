# Board editor, custom stages and rich text evidence

Updated2026-10-13, Africa/Cairo. This addendum is implemented locally with separate Angular/Go apps, PostgreSQL and shared typed REST/MCP services. No new dependency, cloud deployment or production identity change was needed.

## Confirmed behavior

- Board settings create custom stages without a fixed count, with stable category-qualified UUIDs, editable names/order and allowed moves. Starting stages remain stable and can be renamed; Reset keeps custom stages. Stage categories remain immutable and existing stages are retained for issue/history identity.
- Adding stages atomically extends project boards, advances their revisions, respects existing category routing and keeps cards visible across boards. New boards inherit the default workflow. Every unfinished stage must reach a completed stage; rules and stale board revisions are enforced server-side for REST/MCP. Custom completed stages retain blocker/subtask/reopen guards and category filters/counts.
- Kanban columns stay in one horizontal row with bounded scrolling on narrow screens. Actual card/column drag, keyboard moves, custom labels, per-column pagination and100-card windows pass. Empty stages skip extra reads, with at most4 concurrent initial card-page requests.
- Descriptions/comments offer visual and HTML source editing with safe previews, headings/lists/links/marks and Arabic direction. Literal old descriptions remain plain. Unsafe scripts, remote pictures and event attributes are removed.
- Pasting/dropping real PNG/JPEG/WebP files into either visual editor privately uploads and inserts the picture. Failed uploads retain file/retry identity; pending uploads block submission. Existing issue descriptions require published same-issue picture IDs; foreign or expiring draft IDs are denied. Gallery upload returns the committed issue revision, advancing only the editor's own expected single revision and retaining concurrent-edit conflicts. Save a new issue before adding description pictures. Comment pictures retain the existing5-picture/5,000-character bounds; description HTML remains10,000 characters.
- Any attachment kind is accepted as a private download up to10MiB. Other formats, including ZIP/legacy documents/design/source/video files, use application/octet-stream and are never executed/unpacked/rendered as trusted HTML. Known PDF/TXT/CSV/DOCX/XLSX declarations retain actual-format validation. Current permissions, retries, revisions and retained detach history are unchanged.

## Executed verification

- Complete real PostgreSQL Go suite: all packages pass, followed by `go vet ./...`.
- Final affected-feature `go test -race -count=1`: boards, issues, pictures and attachments pass. Additional custom completed-stage blocker/hierarchy test passes with race instrumentation. A45-column workflow verifies no common small-stage ceiling, per-project registration/order, other-board visibility and completed-category filters. Actual MCP workflow save plus REST same-reference replay includes a custom stage.
- Strict Angular templates/application, unit/browser test TypeScript compilation: pass.
- Frontend units:85tests across14files pass, including safe HTML serialization, legacy compatibility, copied workflow drafts and arbitrary-file metadata.
- Full isolated browser suite:42passed,1opt-in timing test skipped, in1.7minutes. Run: `.local/browser-tests/510bc3a318d64f5aa0d3eea6d5d01d0e/`. All5new browser cases pass alongside existing MVP/access/Arabic/retry/drag/attachment/notification/mobile workflows. Tests use disposable databases and private generated accounts, preserving the live project database.
- Generated SQL/OpenAPI/SDK/Zod drift: zero after regeneration.55business operations/28mutations remain in the catalog; local sign-in stays separate.
- Production build passes:850.57kB initial/~184.90kB estimated transfer, under1MB error budget; existing600kB warning persists. Tiptap remains lazy.
- Migration00005 applied additively to the existing local database. Updated API21080 and web4201 are running. Real existing Owner username/password exchange, current user, saved workflow read, health/readiness and web checks return200. Local credentials, company data and existing memberships are preserved.

Screenshots in ignored `.local/browser-evidence/`: `board-flow-editor.png`, `custom-stages-board.png`, `rich-text-issue.png`, plus current desktop/tablet/phone workspace/board/issue evidence. Earlier failed runs remain in their artifacts: the empty-description retry drift was fixed by suppressing editor updates on busy/editable toggles; reload assertions now respect memory-only login; custom drag waits for its preceding mutation; existing attachment selectors and four-column assumptions were updated to the confirmed dynamic scope. The final complete run above passes.

## Remaining external qualification

The original eight tenant/assistant/usability/billing/cloud performance/recovery tasks remain pending. Local correctness and build results do not certify large dynamic-workflow/cloud latency or production readiness. Keep migration00005/data during application rollback; narrowing status/MIME constraints over saved custom data is not an automatic rollback step.
