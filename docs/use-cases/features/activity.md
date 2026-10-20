# Company and issue activity history

Attributed retained history, scoped access, date/resource filters and non-executing change display. Issue detail can consume the same history service. Related tests are references only.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `ui`: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52)
- `live`: [frontend/src/app/features/administration/pages/activity/activity.page.ts:86](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L86)
- `service`: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67)
- `projection`: [backend/internal/features/activity/service.go:321](../../../backend/internal/features/activity/service.go#L321)
- `transport`: [backend/internal/features/activity/mcp.go:11](../../../backend/internal/features/activity/mcp.go#L11)
- `writer`: [backend/internal/features/activity/writer.go:24](../../../backend/internal/features/activity/writer.go#L24)

## Cases

<a id="uc-aud-0001"></a>
### UC-AUD-0001 — Read company activity

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Open Company activity as administrator.

**Expected results**

- Attributed company events show action, resource context and current readable labels.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0002"></a>
### UC-AUD-0002 — Read web channel attribution

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Inspect a mutation initiated through the web app.

**Expected results**

- The event displays Web channel with its human actor.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/writer.go:24](../../../backend/internal/features/activity/writer.go#L24).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0003"></a>
### UC-AUD-0003 — Read MCP channel attribution

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Inspect a mutation initiated through MCP.

**Expected results**

- The event displays MCP channel with the acting human account.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/writer.go:24](../../../backend/internal/features/activity/writer.go#L24).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0004"></a>
### UC-AUD-0004 — Identify automated reminder

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Inspect scheduled due-reminder activity.

**Expected results**

- The page labels it Automated reminder rather than implying a human click.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0005"></a>
### UC-AUD-0005 — Search complete issue key live

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Type a complete issue key into the history filter.

**Expected results**

- Matching history loads without clicking a search button.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:86](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L86), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0006"></a>
### UC-AUD-0006 — Reject incomplete issue key

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Enter a key not matching the complete project-number format.

**Expected results**

- Validation explains a complete issue key is required.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67), [frontend/src/app/features/administration/pages/activity/activity.page.ts:86](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L86).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0007"></a>
### UC-AUD-0007 — Filter by project

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Select a project.

**Expected results**

- Only that project matching events remain.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0008"></a>
### UC-AUD-0008 — Page activity project choices

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose Load more projects in the filter panel.

**Expected results**

- Further accessible project options load without replacing the current event filter.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0009"></a>
### UC-AUD-0009 — Filter starting date

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Set a From date.

**Expected results**

- The service applies the company-calendar lower bound.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

Note: Calendar-boundary integration fixtures retain a genuinely emitted owned event but move its timestamp as historical-data setup only in an exact disposable database. One transaction locks the table, captures the exact enabled append-only trigger, restores it before commit, and proves normal updates remain forbidden. No ordinary API timestamp edit is implied.

<a id="uc-aud-0010"></a>
### UC-AUD-0010 — Filter ending date

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Set a To date.

**Expected results**

- The company-calendar upper bound applies.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

Note: Calendar-boundary integration fixtures retain a genuinely emitted owned event but move its timestamp as historical-data setup only in an exact disposable database. One transaction locks the table, captures the exact enabled append-only trigger, restores it before commit, and proves normal updates remain forbidden. No ordinary API timestamp edit is implied.

<a id="uc-aud-0011"></a>
### UC-AUD-0011 — Reject reversed date range

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose an ending date before the starting date.

**Expected results**

- Validation rejects the range rather than returning misleading history.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0012"></a>
### UC-AUD-0012 — Filter exact resource

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Supply resource kind and valid UUID together.

**Expected results**

- Only matching resource history is returned.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

Note: Calendar-boundary integration fixtures retain a genuinely emitted owned event but move its timestamp as historical-data setup only in an exact disposable database. One transaction locks the table, captures the exact enabled append-only trigger, restores it before commit, and proves normal updates remain forbidden. No ordinary API timestamp edit is implied.

<a id="uc-aud-0013"></a>
### UC-AUD-0013 — Reject resource kind alone

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Supply kind without identifier.

**Expected results**

- Validation requires the paired kind and ID.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0014"></a>
### UC-AUD-0014 — Reject identifier alone

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Supply resource UUID without kind.

**Expected results**

- Validation requires the pair.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0015"></a>
### UC-AUD-0015 — Reject malformed resource identifier

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Supply an invalid or zero resource UUID.

**Expected results**

- The filter is rejected before history can be returned.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0016"></a>
### UC-AUD-0016 — Inspect change details

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Expand View change details.

**Expected results**

- Field names and before/after values appear with explicit empty values.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:321](../../../backend/internal/features/activity/service.go#L321).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0017"></a>
### UC-AUD-0017 — Follow issue history link

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose an issue key in an event.

**Expected results**

- Its issue route opens.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0018"></a>
### UC-AUD-0018 — Read next history page

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose Next activity page.

**Expected results**

- A bounded later page in stable descending event order appears.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0019"></a>
### UC-AUD-0019 — Return to first history page

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose First activity page.

**Expected results**

- The first page for current filters reloads.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0020"></a>
### UC-AUD-0020 — Clear history filters

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Choose Clear history filters.

**Expected results**

- The filter form resets and current company history reloads.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0021"></a>
### UC-AUD-0021 — Retry failed history request

Actor: `company_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Use Retry history search after a request failure.

**Expected results**

- The current intended filters are retried with visible feedback.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0022"></a>
### UC-AUD-0022 — Show history empty state

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Use valid filters with no events.

**Expected results**

- The page explains no activity matches those filters.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0023"></a>
### UC-AUD-0023 — Deny global activity to ordinary project reader

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Request unscoped company history without company administrator access.

**Expected results**

- The service denies the request.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0024"></a>
### UC-AUD-0024 — Read exact issue history as project reader

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Request issue resourceKind and exact current accessible issue resourceId.

**Expected results**

- Relevant retained issue and related-change history is readable.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67), [backend/internal/features/activity/mcp.go:11](../../../backend/internal/features/activity/mcp.go#L11).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0025"></a>
### UC-AUD-0025 — Deny inaccessible issue history

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Request exact history for an inaccessible or missing issue.

**Expected results**

- The unavailable outcome does not reveal unrelated activity.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0026"></a>
### UC-AUD-0026 — Reject mismatched issue project

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Supply an exact issue resource plus a different project filter.

**Expected results**

- The issue is unavailable rather than returning cross-project history.

Sources: [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0027"></a>
### UC-AUD-0027 — Keep personal notification content out of issue history

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Change a personal inbox read state, then read exact issue history as a different authorized project user and inspect generic company notification audit as company administrator.

**Expected results**

- Notification read-state events are excluded from exact issue history, including the linked issue. Company administrators may inspect generic read-state audit metadata, but private inbox message bodies are not included in those projections.

Sources: [backend/internal/features/activity/service.go:321](../../../backend/internal/features/activity/service.go#L321).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go), [coverage-account.spec.ts](../../../frontend/e2e/coverage-account.spec.ts).

Note: The company audit intentionally exposes generic notification read-state changes. Exact issue history explicitly excludes notification resources; this case does not claim administrators cannot see read-state metadata.

<a id="uc-aud-0028"></a>
### UC-AUD-0028 — Preserve retained human attribution

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Read history after actor disable or project archive.

**Expected results**

- Retained events remain attributed rather than being deleted with lifecycle changes.

Sources: [backend/internal/features/activity/writer.go:24](../../../backend/internal/features/activity/writer.go#L24), [backend/internal/features/activity/service.go:67](../../../backend/internal/features/activity/service.go#L67).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0029"></a>
### UC-AUD-0029 — Avoid false no-op history

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Repeat an accepted idempotent mutation or unchanged save.

**Expected results**

- The business services retain a single change effect rather than duplicate substantive history.

Sources: [backend/internal/features/activity/writer.go:24](../../../backend/internal/features/activity/writer.go#L24).

Shared business operations: `list_activity`.

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0030"></a>
### UC-AUD-0030 — Discard stale history result

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Change filters or account before an older search response arrives.

**Expected results**

- The current filter/account result cannot be replaced by obsolete data.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:86](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L86).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0031"></a>
### UC-AUD-0031 — Render Arabic history values

Actor: `company_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Inspect Arabic actor names, resource names and before/after text.

**Expected results**

- Bidi isolation and automatic direction preserve readable text.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).

<a id="uc-aud-0032"></a>
### UC-AUD-0032 — Render change text safely

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Company-wide history requires a company administrator; exact issue history cases use a currently authorized project reader.

**Steps**

1. Inspect a change value containing HTML-looking or script-looking text.

**Expected results**

- The text is displayed as data rather than executed as markup.

Sources: [frontend/src/app/features/administration/pages/activity/activity.page.ts:52](../../../frontend/src/app/features/administration/pages/activity/activity.page.ts#L52), [backend/internal/features/activity/service.go:321](../../../backend/internal/features/activity/service.go#L321).

Related test files: [activity.spec.ts](../../../frontend/e2e/activity.spec.ts), [activity-live-search.spec.ts](../../../frontend/e2e/activity-live-search.spec.ts), [service_test.go](../../../backend/internal/features/activity/service_test.go).
