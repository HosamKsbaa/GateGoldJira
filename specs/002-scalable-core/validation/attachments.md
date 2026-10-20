# Unified attachment validation

**Final status (2026-10-14):** migration 18 is adopted locally and the complete suite passes. The phase checkpoints below are historical; their earlier pending/migration-version statements are superseded by [final-verification.md](final-verification.md), [cutover.md](cutover.md) and [readiness.md](readiness.md).
Canonical assets and actor-scoped upload sessions now own native transfers,
private drafts, publication, retained version references and bounded cleanup.
Legacy picture/document operations retain their request hashes and response
models through adapters. Their metadata readers use canonical projection views;
the temporary physical bridges remain until the verified retirement phase.

## Verified locally on 2026-10-14

- Real PostgreSQL race suite: objectstore 1.121 s; attachments 45.047 s;
  pictures 9.435 s; comments 5.192 s; migration fixtures 9.425 s;
  runtime permission/integration checks 30.352 s.
- Full affected issue race suite: 51.803 s. Private description files/images
  publish inside the owning issue save, advancing its revision once.
- All eleven new operations have concrete REST/MCP schema and permission checks.
  Cross-channel, 23 h 59 min and restarted-backend replays passed in 66.708 s.
  The combined catalog has 131 operations, including 70 retriable mutations.
- Configured 100 MiB upload: 100 bounded chunks, complete size/SHA verification,
  private draft and verified terminal range. Over-limit reservations reject.
- Transfer restart, lost acknowledgements, canceled sessions, wrong SHA,
  ready-session recovery after a failed metadata commit, expired leases,
  revocation after storage I/O, detach retention and collision preflight pass.
- Cleanup claims are durable before I/O. A competing job skips the live lease;
  company/project locks are available while object deletion is paused.
- Strict Angular app/template and test compilation plus 105 unit tests pass.
  Generated artifacts reproduce and architecture checks pass.
- Browser coverage passes for private Arabic documents, lost finalized replies,
  comment/version retention, private description publication, drag/drop file
  queues and image/file preview recovery. Three dedicated native asset tests
  passed together in 16.2 s (run `5297d8dc832e46099347a5e6cb2d7a04`).
  Related inline editing/workspace tests passed in the preceding integrated run;
  all suites will be run together for T051.

## Bounds and ownership

`MAXIMUM_ATTACHMENT_BYTES` defaults to 10 MiB and accepts at most 100 MiB.
Images remain limited to 10 MiB, 20 megapixels, 16,384 pixels per side and 100
animated WebP frames. File/image structure checks remain distinct. Existing
image bytes are preserved without revalidation during migration.

Native byte counts/offsets use decimal JSON strings. Upload/download chunks are
at most 1 MiB; nonfinal uploads align to 256 KiB. Download authorization is
checked before and after storage access. Neither responses nor logs expose
storage coordinates, generations or resumable capability URLs.

Local sessions persist partial files and verify identical chunk replays.
Local range manifests are trusted only after the complete stored SHA matches;
subsequent reads verify the relevant chunk hashes. Google sessions use its
[documented resumable protocol](https://cloud.google.com/storage/docs/performing-resumable-uploads).
The protocol boundary has HTTP unit coverage; real provider/bucket acceptance
remains pending. No external target was provisioned.

Cleanup processes at most 100 candidates per batch and only temporary staging
objects with a known generation or actor-scoped partial-session capability.
Published deletion is absent from the storage interface. Retained comment
versions and descriptions protect referenced data. Restore pause blocks new
claims; wait for existing claims/transfers to drain before restoring storage.

Old document endpoints remain limited to 10 MiB and explicitly direct clients
with larger published files to the shared asset operations. Historical HTML is
unchanged; verified version reference IDs let the renderer open legacy links
whose original frontend hostname is no longer current.

## Adoption still pending

The live local database remains at migration 13. Migrations 14–17 are verified
on isolated fixtures. Storage retirement, the complete final suite, mixed load
and the backed-up local adoption are tracked separately under T048–T054.
