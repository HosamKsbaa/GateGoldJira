# Gaps, discrepancies and external boundaries

[Catalog index](README.md)

These records distinguish source findings, resolved local defects and unavailable external acceptance. Source references alone do not establish a passing outcome; runtime verification is recorded separately by the source-stamped test reports.

<a id="gap-acc-001"></a>
## GAP-ACC-001 — Real managed sign-in acceptance is pending

Classification: `external_acceptance`

Auth0/Google configuration is a candidate. Source and local identity fixtures cannot establish actual tenant, consent, verified-company identity or hosted refresh behavior.

Documentation treatment: Keep production identity cases external_pending and separate local-login results.

Sources: [identity/auth0/README.md:3](../../identity/auth0/README.md#L3), [specs/002-scalable-core/validation/readiness.md:29](../../specs/002-scalable-core/validation/readiness.md#L29).

Related cases: [UC-ACC-0032](features/access.md#uc-acc-0032), [UC-ACC-0033](features/access.md#uc-acc-0033), [UC-ACC-0034](features/access.md#uc-acc-0034).

<a id="gap-prj-001"></a>
## GAP-PRJ-001 — Project metadata directory editing remains company-administrator-only

Classification: `confirmed_documentation_discrepancy`

The shared service and corrected MCP description permit current Configure access. The project directory still shows Edit only to company administrators.

Documentation treatment: Retain the browser affordance distinction without changing product permission policy. Verify REST and MCP permission behavior separately from discoverability.

Sources: [backend/internal/features/projects/service.go:67](../../backend/internal/features/projects/service.go#L67), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:111](../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L111), [backend/internal/features/projects/mcp.go:43](../../backend/internal/features/projects/mcp.go#L43).

Related cases: [UC-PRJ-0025](features/projects.md#uc-prj-0025).

<a id="gap-prj-003"></a>
## GAP-PRJ-003 — Project search only covers loaded directory pages

Classification: `current_boundary`

The directory advertises Search loaded projects and applies local key/name filtering. A project outside loaded pages is not searched globally by that control.

Documentation treatment: Document loaded-only search accurately and retain a case where the sought project is on a later page.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:57](../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L57).

Related cases: [UC-PRJ-0005](features/projects.md#uc-prj-0005).

<a id="gap-prj-004"></a>
## GAP-PRJ-004 — Membership MCP permission description corrected

Classification: `resolved_local_documentation_defect`

The list_memberships description now explicitly permits company Administrator or project administrator with current Configure access, matching the unchanged shared service guard.

Documentation treatment: Retain the correction record and real REST/MCP project-administrator regression assertions. Do not infer browser or hosted-provider acceptance from tool metadata.

Sources: [backend/internal/features/identity/mcp.go:55](../../backend/internal/features/identity/mcp.go#L55), [backend/internal/features/identity/reads.go:80](../../backend/internal/features/identity/reads.go#L80).

Related cases: [UC-PRJ-0035](features/projects.md#uc-prj-0035).

<a id="gap-csv-001"></a>
## GAP-CSV-001 — Import help describes fixed choices rather than canonical configuration

Classification: `confirmed_documentation_discrepancy`

Import help mentions Task/Bug and Low/Medium/High, while the canonical resolver handles eligible configured project choices and stages.

Documentation treatment: Use current resolver behavior in service cases and explicitly record the older visible guidance.

Sources: [frontend/src/app/features/import-export/pages/import-export/import-export.page.html:99](../../frontend/src/app/features/import-export/pages/import-export/import-export.page.html#L99), [backend/internal/features/issues/canonical_import.go:49](../../backend/internal/features/issues/canonical_import.go#L49).

Related cases: [UC-CSV-0058](features/transfer.md#uc-csv-0058).

<a id="gap-mcp-001"></a>
## GAP-MCP-001 — Native plugin issue search requires submission

Classification: `current_boundary`

The Antigravity panel currently submits a search form. The web app live-search interaction does not establish live plugin search.

Documentation treatment: Keep plugin search submit-based in current cases; record the difference from the earlier all-search-live preference.

Sources: [integrations/antigravity/src/ui.ts:154](../../integrations/antigravity/src/ui.ts#L154).

Related cases: [UC-MCP-0098](features/mcp.md#uc-mcp-0098).

<a id="gap-mcp-002"></a>
## GAP-MCP-002 — Hosted native plugin and OAuth acceptance is not established

Classification: `external_acceptance`

The native panel/bridge and browser OAuth source exist. Shared HTTPS access, actual managed identity and supported-host compatibility need their real deployment/provider evidence.

Documentation treatment: Mark external hosted flows external_pending and distinguish local plugin fixtures from real-host acceptance.

Sources: [integrations/antigravity/README.md:70](../../integrations/antigravity/README.md#L70), [docs/mcp-onboarding.md:38](../../docs/mcp-onboarding.md#L38).

Related cases: [UC-MCP-0075](features/mcp.md#uc-mcp-0075), [UC-MCP-0111](features/mcp.md#uc-mcp-0111).

<a id="gap-ntf-001"></a>
## GAP-NTF-001 — Real SMTP and hosted scheduled delivery acceptance is pending

Classification: `external_acceptance`

Sender, preferences, retries and scheduled processing exist in source; successful delivery through the intended SMTP and hosted scheduler is not established by source inspection.

Documentation treatment: Distinguish in-app reminders and local sink logic from external email-delivery acceptance.

Sources: [backend/internal/features/notifications/delivery.go:17](../../backend/internal/features/notifications/delivery.go#L17), [backend/internal/features/notifications/smtp.go:1](../../backend/internal/features/notifications/smtp.go#L1).

Related cases: [UC-NTF-0052](features/notifications.md#uc-ntf-0052), [UC-NTF-0065](features/notifications.md#uc-ntf-0065), [UC-NTF-0066](features/notifications.md#uc-ntf-0066).

<a id="gap-ntf-002"></a>
## GAP-NTF-002 — Email transport has an at-least-once delivery window

Classification: `current_boundary`

SMTP acceptance can succeed before the database commit records completion. A crash in that window can repeat an email despite stable Message-ID; the worker does not promise exactly-once SMTP.

Documentation treatment: Do not encode an exactly-once email guarantee. Distinguish deduplicated in-app/queue records from external transport effects.

Sources: [backend/internal/features/notifications/delivery.go:41](../../backend/internal/features/notifications/delivery.go#L41), [backend/internal/features/notifications/delivery.go:208](../../backend/internal/features/notifications/delivery.go#L208).

Related cases: [UC-NTF-0070](features/notifications.md#uc-ntf-0070).

<a id="gap-iss-001"></a>
## GAP-ISS-001 — Parent-search empty wording excludes custom standard types

Classification: `confirmed_documentation_discrepancy`

The empty state says No matching Task or Bug, but candidate eligibility is based on standard behavior and therefore includes custom standard types.

Documentation treatment: Retain configured-type parent cases and flag misleading copy separately.

Sources: [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:66](../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L66), [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:174](../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L174).

Related cases: [UC-ISS-0057](features/issues.md#uc-iss-0057).

<a id="gap-iss-002"></a>
## GAP-ISS-002 — Find standard parents before paging

Classification: `resolved_local_defect`

Reproduced a hidden parent behind a subtask-only first page. Typed native typeBehavior filtering now runs before SQL LIMIT/count and participates in cursor ownership.

Documentation treatment: Retain the strict UC-ISS-0187 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts:172](../../frontend/src/app/features/issues/components/parent-filter/parent-filter.component.ts#L172).

Related cases: [UC-ISS-0057](features/issues.md#uc-iss-0057), [UC-ISS-0187](features/issues.md#uc-iss-0187).

<a id="gap-iss-003"></a>
## GAP-ISS-003 — Clone uses a limited field/text copy

Classification: `current_boundary`

Cloning flattens HTML description to plain text, omits custom values/planning/workflow selection and linked records, and cloning a subtask creates standard work.

Documentation treatment: Document those actual copy boundaries explicitly; do not promise full-fidelity rich issue cloning.

Sources: [frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts:379](../../frontend/src/app/features/issues/components/modern-issue-actions/modern-issue-actions.component.ts#L379).

Related cases: [UC-ISS-0116](features/issues.md#uc-iss-0116), [UC-ISS-0117](features/issues.md#uc-iss-0117), [UC-ISS-0118](features/issues.md#uc-iss-0118).

<a id="gap-fld-001"></a>
## GAP-FLD-001 — Custom choice search searches loaded pages

Classification: `current_boundary`

Choice filtering is local to loaded options; custom person-field search performs server lookup. These controls do not have identical discovery scope.

Documentation treatment: Document choice pagination plus loaded-page search and separate person lookup behavior.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:106](../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L106).

Related cases: [UC-FLD-0034](features/fields-review-labels.md#uc-fld-0034), [UC-FLD-0035](features/fields-review-labels.md#uc-fld-0035), [UC-FLD-0076](features/fields-review-labels.md#uc-fld-0076).

<a id="gap-fld-002"></a>
## GAP-FLD-002 — Retired custom references may display raw identifiers

Classification: `resolved_local_defect`

Authorized current custom-field pages now include a bounded display projection for retained person and choice references. Stored typed identifiers remain unchanged; retired names render without per-row requests or unauthorized lookup data.

Documentation treatment: Retain the browser friendly-name regression and deterministic Go authorization/paging checks. Runtime results are recorded by source-stamped execution evidence.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:36](../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L36).

Related cases: [UC-FLD-0048](features/fields-review-labels.md#uc-fld-0048), [UC-FLD-0073](features/fields-review-labels.md#uc-fld-0073), [UC-FLD-0079](features/fields-review-labels.md#uc-fld-0079).

<a id="gap-fld-003"></a>
## GAP-FLD-003 — Custom-field conflict review may retain old definitions and options

Classification: `resolved_local_defect`

Conflict Review reloads current definitions and eligible options while retaining the editable draft and original stored values. Renamed/new fields and retired choices no longer leave the editor on stale metadata.

Documentation treatment: Retain the real conflict/review browser scenario, including a renamed field, new field, retired option and newly eligible option. Do not infer applying retired field definitions from draft retention.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:226](../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L226).

Related cases: [UC-FLD-0074](features/fields-review-labels.md#uc-fld-0074).

<a id="gap-ast-001"></a>
## GAP-AST-001 — Attachment limits differ between current surfaces

Classification: `current_boundary`

General resumable files use configured upload policy, images remain limited to 10 MiB, and direct base64/legacy upload schemas have their own smaller limits and MIME support.

Documentation treatment: Keep per-surface limits in cases; do not turn the maximum policy ceiling into an upload promise for every endpoint.

Sources: [backend/internal/features/attachments/asset_types.go:1](../../backend/internal/features/attachments/asset_types.go#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90).

Related cases: [UC-AST-0047](features/assets.md#uc-ast-0047), [UC-AST-0048](features/assets.md#uc-ast-0048), [UC-AST-0073](features/assets.md#uc-ast-0073).

<a id="gap-brd-001"></a>
## GAP-BRD-001 — Clear old quick-filter success during a new save

Classification: `resolved_local_defect`

Reproduced stale success feedback in the browser; the send path now clears its notice before each request.

Documentation treatment: Retain the strict UC-BRD-0093 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:310](../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L310).

Related cases: [UC-BRD-0093](features/boards.md#uc-brd-0093).

<a id="gap-brd-002"></a>
## GAP-BRD-002 — Debounce expanded board query typing

Classification: `resolved_local_defect`

A 12-character input reproduced 12 metadata requests. The expanded text control now debounces before emitting filters.

Documentation treatment: Retain the strict UC-BRD-0094 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:190](../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L190), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:196](../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L196).

Related cases: [UC-BRD-0094](features/boards.md#uc-brd-0094).

<a id="gap-pln-001"></a>
## GAP-PLN-001 — Isolate late planning-item saves

Classification: `resolved_local_defect`

Reproduced destination-editor closure; saves now retain project, session, editor-generation and component ownership.

Documentation treatment: Retain the strict UC-PLN-0077 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:499](../../frontend/src/app/features/planning/project-planning.page.ts#L499).

Related cases: [UC-PLN-0077](features/planning.md#uc-pln-0077).

<a id="gap-pln-002"></a>
## GAP-PLN-002 — Confirm discarding a dirty planning editor

Classification: `resolved_local_defect`

Reproduced silent dirty navigation. Planning now participates in a component-specific route discard guard and browser unload warning.

Documentation treatment: Retain the strict UC-PLN-0078 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:475](../../frontend/src/app/features/planning/project-planning.page.ts#L475), [frontend/src/app/features/projects/projects.routes.ts:44](../../frontend/src/app/features/projects/projects.routes.ts#L44).

Related cases: [UC-PLN-0078](features/planning.md#uc-pln-0078).

<a id="gap-pln-003"></a>
## GAP-PLN-003 — Show exact current stage names in planning and reports

Classification: `resolved_local_defect`

Reproduced Review instead of the custom name. Bounded SQL page projections now return additive stageName without per-issue requests.

Documentation treatment: Retain the strict UC-PLN-0079 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:389](../../frontend/src/app/features/planning/project-planning.page.ts#L389), [frontend/src/app/features/planning/kanban-report.page.ts:373](../../frontend/src/app/features/planning/kanban-report.page.ts#L373).

Related cases: [UC-PLN-0079](features/planning.md#uc-pln-0079).

<a id="gap-int-001"></a>
## GAP-INT-001 — Automation stage discovery is independent of board pagination and layout

Classification: `resolved_local_defect`

Automation now pages active workflows and their stages, retaining canonical IDs and offering only active intake stages. Actual browser tests cover a default board beyond 26 named boards, a valid unmapped stage, closed-stage exclusion, real workflow/stage cursors and persisted rule selection.

Documentation treatment: Retain UC-INT-0055 and UC-INT-0058 as implemented browser regressions; use the current evidence ledger for verification status.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:266](../../frontend/src/app/features/integrations/automation-rules.page.ts#L266), [backend/internal/features/boards/queries.sql:27](../../backend/internal/features/boards/queries.sql#L27).

Related cases: [UC-INT-0055](features/integrations.md#uc-int-0055), [UC-INT-0058](features/integrations.md#uc-int-0058).

<a id="gap-int-002"></a>
## GAP-INT-002 — Isolate development-link continuations

Classification: `resolved_local_verification`

The actual late read failure already remained isolated through native detail child recreation. Additional delayed-save/session checks retain that behavior as an explicit regression boundary.

Documentation treatment: Retain the strict UC-INT-0056 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:219](../../frontend/src/app/features/integrations/development-links.component.ts#L219), [frontend/src/app/features/integrations/development-links.component.ts:253](../../frontend/src/app/features/integrations/development-links.component.ts#L253).

Related cases: [UC-INT-0056](features/integrations.md#uc-int-0056).

<a id="gap-int-003"></a>
## GAP-INT-003 — Isolate late automation saves

Classification: `resolved_local_defect`

Reproduced destination-editor closure; rule saves now check project, session, editor-generation and component ownership.

Documentation treatment: Retain the strict UC-INT-0057 browser regression and current implementation; use the generated first-attempt evidence ledger for verification status.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:472](../../frontend/src/app/features/integrations/automation-rules.page.ts#L472).

Related cases: [UC-INT-0057](features/integrations.md#uc-int-0057).

<a id="gap-shl-001"></a>
## GAP-SHL-001 — Shell default-board discovery reads one board page

Classification: `resolved_local_defect`

The shell now follows bounded board pages until it resolves the default board, and cancels obsolete project/session continuations.

Documentation treatment: Retain UC-SHL-0080 as a later-page browser regression; passing runtime evidence is recorded separately.

Sources: [frontend/src/app/core/workspace/workspace-api.service.ts:72](../../frontend/src/app/core/workspace/workspace-api.service.ts#L72), [frontend/src/app/app.component.ts:481](../../frontend/src/app/app.component.ts#L481).

Related cases: [UC-SHL-0080](features/workspace.md#uc-shl-0080).

<a id="gap-shl-002"></a>
## GAP-SHL-002 — Automation navigation checks a narrower effective role string

Classification: `resolved_local_defect`

The shell Automation link and editor management controls now accept both administrator and project_admin, consistently with shared Configure access.

Documentation treatment: Retain UC-SHL-0081 as a project-administrator navigation and editor-access regression.

Sources: [frontend/src/app/app.component.ts:262](../../frontend/src/app/app.component.ts#L262), [backend/internal/features/integrations/service.go:1](../../backend/internal/features/integrations/service.go#L1).

Related cases: [UC-SHL-0081](features/workspace.md#uc-shl-0081).

<a id="gap-mcp-003"></a>
## GAP-MCP-003 — Native plugin canonical issue discovery compatibility repaired locally

Classification: `resolved_local_defect`

Corrected on 2026-10-19: GateGoldClient.issues now calls search_issues_v2, validates canonical issue/stage results and preserves stage display names in the panel. Five new unit regressions and actual packaged sidecar/browser acceptance verified modern-only discovery and complete mixed-mode pagination across 28 issues.

Documentation treatment: Retain the modern/mixed search regressions. Local isolated Go/PostgreSQL and native sidecar evidence does not close actual managed-provider, installed company-host or shared deployment acceptance; those remain tracked separately.

Sources: [integrations/antigravity/src/mcp.ts:37](../../integrations/antigravity/src/mcp.ts#L37), [integrations/antigravity/src/models.ts:47](../../integrations/antigravity/src/models.ts#L47), [integrations/antigravity/src/ui.ts:120](../../integrations/antigravity/src/ui.ts#L120), [integrations/antigravity/tests/mcp-search.test.ts:32](../../integrations/antigravity/tests/mcp-search.test.ts#L32), [frontend/e2e/antigravity-plugin.spec.ts:130](../../frontend/e2e/antigravity-plugin.spec.ts#L130).

Related cases: [UC-MCP-0098](features/mcp.md#uc-mcp-0098), [UC-MCP-0099](features/mcp.md#uc-mcp-0099), [UC-MCP-0112](features/mcp.md#uc-mcp-0112), [UC-MCP-0113](features/mcp.md#uc-mcp-0113).
