# Issues, ranked backlog and CSV migration

The issue feature owns the shared typed REST/MCP services for issue creation,
editing, movement, organization, ranked backlog and CSV migration. Current
project access, revision checks, caller-scoped retry references, retained audit
and workflow/completion guards apply through both transports.

## Issue number search

A digit-only query matches the exact displayed issue number: `2` or `002`
finds issue 2, without matching issue 12 or a different issue whose title contains
2. Search trims surrounding whitespace. Full issue keys, project-key prefixes
and literal title searches still work. The same rule applies to REST/MCP issue
search and saved/temporary board filters, with current project access and all
other selected filters retained. The blocker picker searches as you type and
restricts candidates to the current project, excluding the issue itself.

## Backlog ordering

Creating planned work sets backlog membership and rank in the same transaction.
It does not increment active column order. Backlog pages use a signed,
revision-scoped `(rank, id)` cursor and a separate project backlog revision;
reordering checks both that revision and the issue revision. Neighbor issues
must belong to the same project's current backlog. Rank gaps are used first,
with bounded rebalancing when necessary. Returning active or archived work to
the backlog assigns a fresh trailing rank, avoiding collisions with retained
old ranks. Activating planned work applies the ordinary workflow guards and
eligible stage assignment rule inside the mutation transaction.

## CSV import

Preview and import accept UTF-8 CSV, including a BOM, up to 1 MiB and 100 data
rows per batch. Headers are unique and bounded. Mapping supports title,
description, description format, type, priority, assignee, due date, labels,
external source key and status; `-` explicitly skips an optional field.
Assignees must resolve uniquely to an eligible project user. Descriptions use
the existing plain-text/sanitized-HTML validation. Labels are semicolon
separated and retain the ordinary ten-label limit.

Preview reports individual row errors and existing source identities. The web
client requires explicit confirmation. Import reserves the original batch input
under its retry identity before writing any rows, and invokes ordinary issue
and label services with deterministic child references. Validation errors are
reported per row. Temporary database errors leave the batch resumable rather
than saving a permanent failed outcome. Stable source keys prevent duplicates
across batches; rows without an external key use the original batch identity.

## CSV export and round trips

Export applies current project access and supplied issue filters, returning
bounded pages. The web client downloads every page and writes the header once.
Descriptions and import source identities are included. Spreadsheet formula
cells are prefixed with an apostrophe; this protection can remain visible in
ordinary text fields when importing the file elsewhere.

The `sourceKey` column uses base64url encoding, with
`sourceKeyEncoding=base64url-v1` on the same row. GateGoldJira automatically
decodes this metadata when the source-key mapping selects the exported
`sourceKey` column. Preserve both columns to retain exact external identities,
including identities beginning with formula characters, and avoid duplicate
issues on reimport. An explicitly mapped different source column is treated as
ordinary input. Export is a migration aid rather than a database backup;
comments, attachments, audit history and links are not exported in this CSV.

## Verification

`backlog_import_test.go` uses disposable PostgreSQL databases with race checks
for atomic backlog creation, independent ranking, cursor/revision scope,
revoked access, uncertain retries, partial imports, resumed transient errors,
cross-batch duplicate handling and encoded source-identity round trips.
`tests/parity/audit_backlog_import_test.go` exercises the same services through
REST and MCP. Browser journeys cover ranked drag/keyboard ordering, delayed
cross-project create responses, mapped preview, explicit confirmation,
uncertain-response recovery and export/reimport.
