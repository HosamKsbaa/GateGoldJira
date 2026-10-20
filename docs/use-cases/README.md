# GateGoldJira use-case catalog

Catalog date: **2026-10-20**, Africa/Cairo. Scope: **current application**. Three parallel source audits supplied the feature inventories; the final catalog was consolidated and checked against current source and generated contracts.

This catalog defines the current expectations. Its `runtimeVerification: not_run` fields describe source-only catalog evidence; actual execution is recorded separately by the source-stamped coverage reports. Existing test links and source references never count as a passing test. The [test strategy](test-strategy.json) describes execution, coverage gates and external boundaries.

**1772 individually identified cases** across **20 areas**, with **28 route declarations**, **140 OpenAPI operations** and **133 published MCP tools** reconciled to catalog ownership/references. Counts include explicitly unavailable and externally pending cases; they are not counts of passing tests. Route declarations include lazy parents and fallback routes, not just screens.

## Read the catalog

| Area | Cases | Detailed document |
|---|---:|---|
| Authentication, sessions and company accounts | 63 | [access](features/access.md) |
| Company and issue activity history | 32 | [activity](features/activity.md) |
| Unified attachments, private previews and recoverable uploads | 86 | [assets](features/assets.md) |
| Backlog planning, ranking and activation | 41 | [backlog](features/backlog.md) |
| Boards, columns, card movement and filters | 112 | [boards](features/boards.md) |
| Rich descriptions, discussion and selected mentions | 137 | [collaboration](features/collaboration.md) |
| Compatibility clients and retained data | 30 | [compatibility](features/compatibility.md) |
| Project taxonomy, typed custom fields and safe activation | 90 | [configuration](features/configuration.md) |
| Issue custom values, approval execution and reusable labels | 183 | [fields-review-labels](features/fields-review-labels.md) |
| Manual development links and stage assignment rules | 65 | [integrations](features/integrations.md) |
| Issues, discovery, editing, bulk actions and saved searches | 203 | [issues](features/issues.md) |
| MCP protocol, account connections and native Antigravity plugin | 113 | [mcp](features/mcp.md) |
| Watching, private inbox and notification delivery | 72 | [notifications](features/notifications.md) |
| Epics, releases, issue planning and Kanban reports | 91 | [planning](features/planning.md) |
| Shared API, authorization and transport rules | 33 | [platform](features/platform.md) |
| Projects and project membership | 71 | [projects](features/projects.md) |
| Subtasks, blockers and retained issue relations | 90 | [relationships](features/relationships.md) |
| CSV issue import and export | 72 | [transfer](features/transfer.md) |
| Workflows, stages, transitions, policies and migration | 97 | [workflows](features/workflows.md) |
| Workspace, navigation and shared controls | 91 | [workspace](features/workspace.md) |

## Status and terminology

- `implemented`: the documented path exists in source; a separate runtime report determines whether its exact outcome passes.
- `service_only`: a service/API/MCP behavior has no equivalent discovered native web action.
- `external_pending`: a candidate integration needs its actual identity provider, host, SMTP, cloud or storage target.
- `not_implemented`: the action is deliberately recorded as unavailable; do not write a positive acceptance test assuming it exists.
- `unclear`: source exposes a mismatch or incomplete evidence; resolve the linked gap before freezing an acceptance expectation.

Actor meanings and role boundaries are in [roles.md](roles.md). A board column groups workflow stages; it does not define those stages. Approval votes do not themselves move an issue. Creation defaults apply to omitted custom values; explicit null is a different input. Draft recovery is in memory for the signed-in tab unless a case says otherwise.

## Supporting records

- [Structured case catalog](catalog.json) and [JSON Schema](catalog.schema.json).
- [Route, API, MCP and UI-handler inventory](surface-inventory.json) and [human-readable inventory](surface-inventory.md).
- [Gaps and unavailable/external flows](gaps.md).
- [Actors and role boundaries](roles.md).
- [Documentation validation and its limits](validation.md).

`sourceFingerprint` records SHA-256 of referenced source, route definitions, observed UI-event bindings, contract manifests and related test files. It identifies this source baseline, not a clean commit or a successful build. Generated documentation is excluded from that baseline to avoid self-referential hashes.

## Case structure

Each case records actor, preconditions, steps, observable expected results, applicable surfaces, behavioral kind, implementation status, source evidence, operation references and known gaps. Materially different outcomes are separate case IDs; shared role/transport invariants also have standalone cases with their applicability stated. Reusing an implementation does not establish cross-surface test coverage.

IDs stay stable after publication. Add new cases with unused numbers, retain removed cases as unavailable with an explanation, and avoid renumbering unrelated cases. Semantic duplicates should reference a canonical case rather than inflate the count. The area JSON files are authored sources; aggregate JSON, feature Markdown, gap Markdown, index and inventories are rendered by the local documentation tool.

## Maintain and validate

```sh
python3 docs/use-cases/build_catalog.py
python3 docs/use-cases/build_catalog.py --check
```

The check validates IDs, required fields, actors/statuses, source paths/line bounds, test-file references, gap links, operation names, complete current HTTP/MCP operation mapping, route/UI-handler ownership and deterministic generated artifacts. It does not evaluate app behavior, prove line-level semantics or claim every dynamically generated UI control has been discovered. The UI binding inventory is heuristic and ownership is area-level; later browser inspection must reconcile actual controls and assertions.

Templates/recurrence, automatic Git sync, general automation, roadmap, worklogs and sprints are excluded as future recommendations. Ordinary comment deletion, nested subtasks, direct parent reassignment, label rename/delete and approval withdrawal are recorded only as current boundaries where relevant. Production acceptance remains distinct from local test adapters.

Executable tests now map stable IDs to assertion-bearing Playwright steps. See [test-strategy.json](test-strategy.json) for measurement definitions, commands, the strict100% target and external boundaries. Runtime evidence remains separate from this source-inspected catalog; existing-test links alone never count as passing coverage.
