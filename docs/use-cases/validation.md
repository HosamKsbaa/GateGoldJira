# Documentation validation

Source validation date: **2026-10-20**, Africa/Cairo.

[Catalog index](README.md) · [Structured catalog](catalog.json) · [Known gaps](gaps.md)

This report records source-catalog validation only. Browser/API/MCP execution and source-code coverage are measured separately using the commands and boundaries in [test-strategy.json](test-strategy.json); neither source links nor these documentation checks prove a passing application outcome.

## Results

| Check | Result |
|---|---|
| Unique case records | 1,769 across 20 areas |
| Actor, surface, kind and implementation enums | Valid |
| Required preconditions, steps, expected results and evidence | Present |
| Exact duplicate actor/precondition/action/result records | None |
| Current OpenAPI operation mappings | 140 of 140 mapped |
| Current published MCP tool mappings | 133 of 133 mapped |
| Route declarations with an owning catalog area | 28 of 28 |
| Observed Angular event bindings with area ownership | 548; heuristic source inventory |
| Source and related-test fingerprints | 312 files |
| Source paths, line bounds, existing test paths and gap links | Valid |
| Local Markdown links and explicit anchors | Checked; no broken references |
| Catalog against JSON Schema Draft 2020-12 | Passed with existing local Ajv dependency |
| Deterministic generated documentation | Current; `--check` passed |

All catalog records explicitly say `runtimeVerification: not_run` because that field records source evidence. Current implementation classifications are 1,599 source-implemented, 146 service-only, 13 external-pending and 11 unavailable. These classifications are independent of runtime pass counts.

The 27 gap records include resolved local defects as well as remaining boundaries. Their current classification counts are `{"confirmed_documentation_discrepancy": 3, "current_boundary": 6, "external_acceptance": 3, "resolved_local_defect": 13, "resolved_local_documentation_defect": 1, "resolved_local_verification": 1}`. Consult the linked case expectations and source-stamped runtime evidence before claiming acceptance.

## Reproduce the checks

From the repository root:

```sh
python3 docs/use-cases/build_catalog.py --check
```

This is read-only. Omitting `--check` renders documentation from the authored area JSON files.

The independent schema check used the already installed frontend dependency; no package installation or lockfile changes were made:

```js
const fs = require('node:fs');
const Ajv2020 = require('./frontend/node_modules/ajv/dist/2020.js');
const schema = JSON.parse(fs.readFileSync('docs/use-cases/catalog.schema.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('docs/use-cases/catalog.json', 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
if (!validate(catalog)) throw new Error(JSON.stringify(validate.errors));
```

## Limits

The source audit identifies implemented paths and known uncertainties. Assertion-bearing Playwright steps now identify individual cases and interfaces. A related test filename alone still proves no outcome. UI-handler ownership is area-level and does not establish semantic coverage of every runtime control. Schema validity and reference completeness do not prove that every expected result is correct at runtime; use the separate execution ledger and measured source coverage for that assessment.

The source baseline includes uncommitted files, identified by hashes rather than a claim of a clean Git commit. Preserve stable IDs when correcting descriptions or adding later test mappings.
