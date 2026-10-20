# Validation notes and remaining work

Recorded on 20 October 2026. See [verification.md](verification.md) for the current measured results and [source-gaps.md](source-gaps.md) for uncovered frontend locations.

## What passed locally

- The full, unfiltered Chromium cohort selected 884 tests: 883 passed, zero failed, and one instrumented timing test was explicitly skipped. There were no retries. A separate uninstrumented run passed that timing test.
- All 1,759 locally eligible documented cases passed on every declared interface: 3,367 verified case/interface pairs. The catalog contains 1,772 cases in total; 13 actual provider or supported-host acceptance cases remain pending.
- The complete frontend unit run passed 781 tests across 64 files. Test TypeScript checking passed.
- Reporting and evidence validation passed 83 Python regression tests and 16 Node regression tests.
- The identity package passed its one local test. The portable integration plugin passed its 16 unit tests. These do not establish actual identity-provider or installed-host acceptance, or source percentages for those packages.
- The retained Go verification passed the complete 39-package race-enabled suite. The frontend production build, architecture checks, Go vet and generated-contract checks passed against unchanged application sources.

The browser suite exercises the web app, real local REST and MCP services, isolated PostgreSQL and supported local integration boundaries. Unit tests cover additional controller and service boundaries; passing a unit test does not imply a DOM interaction was tested. Chromium is the only verified browser engine. Hosted GitHub Actions execution has not been verified; local workflow and reporting checks do not establish a hosted CI result.

Catalog coverage describes documented behavior, including rejection of unavailable operations. Eleven local cases explicitly verify boundaries for features classified as not implemented. Passing those cases does not implement the absent features or establish complete Jira feature parity. Some supported service operations have no corresponding web UI.

## Source target remains incomplete

| Measurement | Covered / total | Result |
|---|---:|---:|
| Combined frontend executable lines | 7,915 / 8,639 | 91.61% |
| Combined frontend branch arms | 4,630 / 5,576 | 83.03% |
| Combined frontend statements | 8,697 / 9,764 | 89.07% |
| Combined frontend functions | 882 / 2,067 | 42.67% |
| Go statements | 13,481 / 16,851 | 80.0% rounded |

The frontend denominator contains all 123 handwritten runtime TypeScript files, including bootstrap. Specs and the two generated API directories are excluded. Unit and browser counters are combined only when their source hashes and exact mapped spans agree. Percentages are never added. Incompatible compiler mappings remain uncredited, so the gap map records measured uncovered counters; it does not prove a missing product feature.

There are **724 uncovered executable frontend lines and 946 uncovered branch arms**. The complete positions are recorded in [source-gaps.json](source-gaps.json), including unavailable compiler-map positions as null. Go has **3,370 uncovered statements**. Go's native tool measures statements; no Go line or branch percentage has been measured. Identity and plugin source percentages are also unmeasured.

The strict 100% gate was run on the complete, valid evidence and failed as expected: both source denominators were verified, but source targets and external acceptance remain incomplete. That is a target failure, not a passing 100% result.

To reach the requested target, remaining work includes meaningful assertions for the recorded source gaps, independent Go line/branch measurement, source measurement for the identity and plugin packages, and actual provider/supported-host acceptance. Each change requires a new validated source-bound run; current results must not be carried forward as if they covered changed code. External prerequisites are listed in [external-acceptance.md](../external-acceptance.md).

## Local performance scope

The separate uninstrumented Chromium run measured 100 warmed journeys per operation. Project p95 was approximately **147 ms**, and board p95 approximately **408 ms**, against the test's **2,000 ms** budget. These are small local-fixture journeys on the development server. They do not establish cloud, cold-start or 200,000-issue browser performance. Numeric results are in [performance.json](performance.json).

A separate retained local backend benchmark used 200,000 canonical issues in one project and a mixed authenticated REST/MCP workload with 100 simultaneous users. Recorded p95 values were 393 ms for search (1,000 trials), 435 ms for broad board reads (10 trials), 373 ms for priority writes (200 trials), and 587 ms for comment writes (100 trials). Each met its recorded local budget. The small board sample and local environment limit that conclusion. This is a retained benchmark record against unchanged backend sources, not cloud acceptance or a cryptographically attested browser cohort.

## Evidence and publication

The published JSON summaries are curated display reports. The actual producer-bound profiles, run proofs, logs, browser results and private test artifacts remain private. The published measurement metadata includes their identities and hashes, not their contents; the public folder alone is not a self-contained input to the strict gate. No raw source bundles, upload contents, credentials or tokens are published here.

Historical shutdown and drag observations are qualified in [verification.md](verification.md). Later passing tests establish current outcomes without establishing an unproven cause or repair for earlier failures.
