# CSV issue import and export

File intake, mapping, nonmutating preview, explicit confirmation, deduplicated import and bounded filtered export. Related test references do not certify per-case coverage or execution.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `ui`: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27)
- `page`: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51)
- `load`: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205)
- `exportUi`: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357)
- `parser`: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99)
- `mapping`: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139)
- `preview`: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159)
- `import`: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478)
- `export`: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634)
- `formula`: [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627)
- `choices`: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49)
- `draft`: [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12)
- `guidance`: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:99](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L99)

## Cases

<a id="uc-csv-0001"></a>
### UC-CSV-0001 — Open project transfer

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Open Import and export in an active writable project.

**Expected results**

- Project-scoped import and export controls appear.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0002"></a>
### UC-CSV-0002 — View read-only transfer

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Open the page as a viewer.

**Expected results**

- Export is available and import has a read-only role explanation.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0003"></a>
### UC-CSV-0003 — Explain archived import denial

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Open the page for an archived project.

**Expected results**

- The page asks for restoration before importing.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0004"></a>
### UC-CSV-0004 — Choose CSV file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose a valid nonempty UTF-8 CSV.

**Expected results**

- Filename and heading list appear for mapping.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0005"></a>
### UC-CSV-0005 — Drop CSV file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Drop a valid CSV on the file target.

**Expected results**

- The same intake and mapping flow starts.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0006"></a>
### UC-CSV-0006 — Reject empty file

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose an empty file.

**Expected results**

- The page requires a nonempty UTF-8 CSV.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0007"></a>
### UC-CSV-0007 — Reject oversized file

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose a CSV larger than one MiB.

**Expected results**

- The file is rejected before preview.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0008"></a>
### UC-CSV-0008 — Reject invalid UTF-8

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose bytes that cannot decode as UTF-8.

**Expected results**

- The page explains preserving Arabic and other text using UTF-8.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:205](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L205), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0009"></a>
### UC-CSV-0009 — Accept UTF-8 BOM

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a valid CSV beginning with BOM.

**Expected results**

- The first heading is recognized without BOM.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0010"></a>
### UC-CSV-0010 — Preserve quoted CSV cells

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview quoted commas and embedded newlines.

**Expected results**

- Fields retain their intended values.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0011"></a>
### UC-CSV-0011 — Require valid headings

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview content without a valid header row.

**Expected results**

- Header validation rejects the file.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0012"></a>
### UC-CSV-0012 — Require data rows

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a header-only file.

**Expected results**

- Validation requires at least one data row.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0013"></a>
### UC-CSV-0013 — Bound headings

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview more than 30 columns.

**Expected results**

- The parser rejects the file.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0014"></a>
### UC-CSV-0014 — Reject blank headings

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a blank or whitespace-only heading.

**Expected results**

- The parser rejects ambiguous empty headings.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0015"></a>
### UC-CSV-0015 — Reject duplicate headings

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview duplicate headings after trimming/case normalization.

**Expected results**

- The file is rejected.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0016"></a>
### UC-CSV-0016 — Reject malformed quoting

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview an unbalanced quoted row.

**Expected results**

- The file is rejected with row syntax validation.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0017"></a>
### UC-CSV-0017 — Reject inconsistent row width

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a row with a different field count.

**Expected results**

- The parser rejects the inconsistent row.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0018"></a>
### UC-CSV-0018 — Bound data rows

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview more than 100 data rows.

**Expected results**

- The parser rejects an unbounded batch.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0019"></a>
### UC-CSV-0019 — Map recognized headings

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Leave recognized Title/Summary and optional headings on Automatic.

**Expected results**

- Recognized aliases map to supported fields.

Sources: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0020"></a>
### UC-CSV-0020 — Map custom heading

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Select an explicit nonstandard heading for a field.

**Expected results**

- Preview reads that selected column.

Sources: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0021"></a>
### UC-CSV-0021 — Skip optional column

Actor: `writer` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Pass the optional skip mapping marker through the API.

**Expected results**

- The optional field is not mapped.

Sources: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0022"></a>
### UC-CSV-0022 — Reject missing selected heading

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Map a field to a heading absent from the CSV.

**Expected results**

- A mapping validation error is returned.

Sources: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: The public CSV page fixes its route project and offers only headings parsed from the selected file. This hostile raw input is a REST/MCP service boundary, not an available browser control.

<a id="uc-csv-0023"></a>
### UC-CSV-0023 — Require title mapping

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview without a mapped Title or Summary.

**Expected results**

- Preview is rejected with a required mapping explanation.

Sources: [backend/internal/features/issues/import_export.go:139](../../../backend/internal/features/issues/import_export.go#L139), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0024"></a>
### UC-CSV-0024 — Read every preview row

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Preview import.

**Expected results**

- Row numbers, titles, source keys, field errors and valid/error totals are displayed.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-CSV-0071.

<a id="uc-csv-0025"></a>
### UC-CSV-0025 — Keep preview nonmutating

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview valid rows without confirming import.

**Expected results**

- No issue is created by preview.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0026"></a>
### UC-CSV-0026 — Resolve custom type key

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a configured active standard-type key.

**Expected results**

- Canonical project type is resolved.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0027"></a>
### UC-CSV-0027 — Resolve scoped choice UUID

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview an active type, priority or stage ID in the project.

**Expected results**

- The exact scoped choice resolves.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0028"></a>
### UC-CSV-0028 — Resolve unique choice name

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a unique configured display name.

**Expected results**

- Exactly one scoped choice resolves.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0029"></a>
### UC-CSV-0029 — Reject ambiguous choice name

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a choice name matching several eligible records.

**Expected results**

- The row reports ambiguity rather than selecting arbitrarily.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0030"></a>
### UC-CSV-0030 — Reject unavailable choice

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a retired-for-new-use, unknown or foreign choice.

**Expected results**

- The row receives a scoped choice error.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0031"></a>
### UC-CSV-0031 — Reject imported subtask type

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Select a subtask behavior without an owning parent flow.

**Expected results**

- The row instructs importing standard work first and adding subtasks through a parent.

Sources: [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0032"></a>
### UC-CSV-0032 — Resolve eligible assignee

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a unique eligible teammate name, email or ID.

**Expected results**

- The intended eligible person resolves.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0033"></a>
### UC-CSV-0033 — Reject ambiguous assignee

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a shared teammate display name.

**Expected results**

- The row reports ambiguity.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0034"></a>
### UC-CSV-0034 — Reject ineligible assignee

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a disabled or otherwise ineligible person.

**Expected results**

- The row reports an assignee error.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0035"></a>
### UC-CSV-0035 — Validate calendar date

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview an impossible or malformed due date.

**Expected results**

- The row receives due-date validation.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0036"></a>
### UC-CSV-0036 — Map semicolon labels

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview semicolon-separated labels.

**Expected results**

- Valid labels are prepared without losing supported text.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0037"></a>
### UC-CSV-0037 — Reject long source identity

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a source key exceeding 200 characters.

**Expected results**

- The row receives source-key validation.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0038"></a>
### UC-CSV-0038 — Reject repeated source in batch

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview two rows using the same nonempty source key.

**Expected results**

- The duplicate row points to its earlier source-key row.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0039"></a>
### UC-CSV-0039 — Decode exported source identity

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview a valid export sourceKeyEncoding value.

**Expected results**

- The original source identity is decoded for deduplication.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0040"></a>
### UC-CSV-0040 — Reject unsupported source encoding

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview an unsupported or malformed encoded source identity.

**Expected results**

- The row reports source identity validation.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0041"></a>
### UC-CSV-0041 — Preserve Arabic transfer values

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview and import Arabic titles, descriptions and labels.

**Expected results**

- Unicode content survives mapping and issue reads.

Sources: [backend/internal/features/issues/import_export.go:99](../../../backend/internal/features/issues/import_export.go#L99), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159), [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478).

Shared business operations: `preview_issue_import`, `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0042"></a>
### UC-CSV-0042 — Sanitize HTML import

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Import HTML-format description containing unsupported markup.

**Expected results**

- Shared creation sanitation produces retained safe description content.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159), [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0043"></a>
### UC-CSV-0043 — Invalidate preview after mapping edit

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Change the mapping after preview.

**Expected results**

- Old preview and confirmation are cleared.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0044"></a>
### UC-CSV-0044 — Invalidate preview after file replacement

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose another CSV after preview.

**Expected results**

- The old file preview/result/confirmation cannot be reused.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0045"></a>
### UC-CSV-0045 — Require explicit import confirmation

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Preview valid rows without checking review confirmation.

**Expected results**

- Import valid rows stays disabled.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0046"></a>
### UC-CSV-0046 — Start a new corrected import

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Start a new import after reviewing row errors.

**Expected results**

- The previous locked payload, result and confirmation reset.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0047"></a>
### UC-CSV-0047 — Restore tab-local import draft

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Leave and return within the same signed-in browser tab.

**Expected results**

- The project-specific draft returns and must be previewed again.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0048"></a>
### UC-CSV-0048 — Clear import draft on session end

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Sign out or reload with a held draft.

**Expected results**

- The in-memory draft is not restored into a different session.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0049"></a>
### UC-CSV-0049 — Discard obsolete project transfer reply

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Switch project/session before delayed preview/export completes.

**Expected results**

- Old results cannot replace another project or account state.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0050"></a>
### UC-CSV-0050 — Open imported issues

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Follow View imported issues after import.

**Expected results**

- The correct project active/backlog issue view opens.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51), [frontend/src/app/features/import-export/import-drafts.service.ts:12](../../../frontend/src/app/features/import-export/import-drafts.service.ts#L12).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0051"></a>
### UC-CSV-0051 — Import confirmed valid rows

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Confirm preview and start import.

**Expected results**

- Every row returns created/existing/failed with counts and issue links.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0052"></a>
### UC-CSV-0052 — Import into backlog

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Select backlog as destination and import.

**Expected results**

- Created work is planned rather than active on the board.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0053"></a>
### UC-CSV-0053 — Deduplicate stable source identity

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Import an already used stable source key in another batch.

**Expected results**

- The existing issue is returned without duplicate creation.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0054"></a>
### UC-CSV-0054 — Retain source-less retry identity

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Retry rows without supplied source key using the same batch ID.

**Expected results**

- Batch and row identities reuse the original accepted work.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0055"></a>
### UC-CSV-0055 — Preserve successful rows after partial failure

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Import a batch with some failing rows.

**Expected results**

- Successful rows remain created and each failed row remains identified.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0056"></a>
### UC-CSV-0056 — Retry original uncertain import

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Repeat frozen original payload, batch and retry reference after temporary failure.

**Expected results**

- Accepted rows are reused and recoverable rows can resume.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0057"></a>
### UC-CSV-0057 — Reject archived project import

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Call import_issues for archived project work.

**Expected results**

- Current authorization rejects creating work until restoration.

Sources: [backend/internal/features/issues/import_export.go:478](../../../backend/internal/features/issues/import_export.go#L478), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:51](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L51).

Shared business operations: `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: This row explicitly calls import_issues on an archived project, a service-only hostile request. The real browser hides import controls on archived projects, separately exercised by UC-CSV-0003.

<a id="uc-csv-0058"></a>
### UC-CSV-0058 — Read accepted-value guidance

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Expand Accepted values and repeat imports.

**Expected results**

- Source identity/format help appears, but fixed task/bug and low/medium/high wording is stale against canonical choices.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:99](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L99), [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Gaps: [GAP-CSV-001](../gaps.md#gap-csv-001).

<a id="uc-csv-0059"></a>
### UC-CSV-0059 — Export all current work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose All current work then export.

**Expected results**

- Every authorized matching current issue is included.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0060"></a>
### UC-CSV-0060 — Export active work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Active board then export.

**Expected results**

- Only matching active-view work is included.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0061"></a>
### UC-CSV-0061 — Export backlog

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Backlog then export.

**Expected results**

- Only matching planned work is included.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0062"></a>
### UC-CSV-0062 — Export archived work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Archived work then export.

**Expected results**

- Retained matching archived issues are included with current read permission.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0063"></a>
### UC-CSV-0063 — Filter exported key/title

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Enter key/title query then export.

**Expected results**

- The server filters matching issues before export pages are returned.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0064"></a>
### UC-CSV-0064 — Collect every export page

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Export results spanning several server pages.

**Expected results**

- The browser combines all rows with one heading row and accurate progress.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-CSV-0072.

<a id="uc-csv-0065"></a>
### UC-CSV-0065 — Protect spreadsheet formulas

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Export text beginning with formula triggers.

**Expected results**

- Formula-safe cells preserve data without executing spreadsheet formulas.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0066"></a>
### UC-CSV-0066 — Reject cross-project export filters

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Pass filters selecting multiple or another project.

**Expected results**

- The export requires one current authorized project.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: The public CSV page fixes its route project and offers only headings parsed from the selected file. This hostile raw input is a REST/MCP service boundary, not an available browser control.

<a id="uc-csv-0067"></a>
### UC-CSV-0067 — Bound export page bytes

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Request a page whose descriptions exceed one MiB.

**Expected results**

- The service asks for a smaller page.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0068"></a>
### UC-CSV-0068 — Enforce current transfer permission

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Remove role access before import/export request.

**Expected results**

- Current service authorization rejects operations no longer allowed.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0069"></a>
### UC-CSV-0069 — Cancel export preparation

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Choose Cancel export while pages load.

**Expected results**

- Preparation stops and no partial file is presented as a completed download.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357).

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0070"></a>
### UC-CSV-0070 — Round-trip supported export values

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Export then preview/reimport supported descriptions, choices, Arabic and encoded source keys.

**Expected results**

- Supported values/source identity remain and existing source work is not duplicated.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159), [backend/internal/features/issues/canonical_import.go:49](../../../backend/internal/features/issues/canonical_import.go#L49).

Shared business operations: `export_issues`, `preview_issue_import`, `import_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

<a id="uc-csv-0071"></a>
### UC-CSV-0071 — Return complete typed import preview rows

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Call preview_issue_import for a multirow CSV containing valid and invalid rows.

**Expected results**

- Every row includes its number, title, source key and field errors, with exact valid/error totals.

Sources: [backend/internal/features/issues/import_export.go:159](../../../backend/internal/features/issues/import_export.go#L159), [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:27](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L27).

Shared business operations: `preview_issue_import`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: Atomic service counterpart split from UC-CSV-0024; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-csv-0072"></a>
### UC-CSV-0072 — Continue bounded CSV export pages

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated project role; imports target an active project and exports require current read access unless the scenario says otherwise.

**Steps**

1. Request an export limit smaller than the matching issue set and continue its cursor until exhausted.

**Expected results**

- Every matching issue is represented once across bounded pages with a consistent total; the terminal page has no next cursor.

Sources: [backend/internal/features/issues/import_export.go:634](../../../backend/internal/features/issues/import_export.go#L634), [frontend/src/app/features/import-export/pages/import-export/import-export.page.ts:357](../../../frontend/src/app/features/import-export/pages/import-export/import-export.page.ts#L357), [backend/internal/features/issues/import_export.go:627](../../../backend/internal/features/issues/import_export.go#L627).

Shared business operations: `export_issues`.

Related test files: [import-export.spec.ts](../../../frontend/e2e/import-export.spec.ts), [csv-columns.spec.ts](../../../frontend/src/app/features/import-export/csv-columns.spec.ts), [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go).

Note: Atomic service counterpart split from UC-CSV-0064; it does not claim browser rendering, form state, session epochs or download assembly.
