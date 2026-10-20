# Verification

This report does not claim 100% coverage.

Browser cohort: 888 selected; 887 passed; 0 failed; 1 skipped. Scope: full, unfiltered Chromium; no retries.
Explicit coverage-instrumented timing opt-outs: 1. Performance is a separate uninstrumented measurement.

| Scope | Passed cases | Every declared surface | Verified interface pairs |
|---|---:|---:|---:|
| Entire documented catalog | 1768 / 1781 | 1768 / 1781 | 3378 / 3399 |
| Documented local cases | 1768 / 1768 | 1768 / 1768 | 3378 / 3378 |

Thirteen actual provider/supported-host cases remain external pending: UC-ACC-0032, UC-ACC-0033, UC-ACC-0034, UC-ACC-0058, UC-MCP-0075, UC-MCP-0085, UC-MCP-0111, UC-NTF-0065, UC-NTF-0066, UC-SYS-0028, UC-SYS-0030, UC-SYS-0031, UC-SYS-0032.

## Frontend unit

Successful full unit run: 1000 passed tests across 74 files.

| Metric | Covered / total | Percent |
|---|---:|---:|
| lines | 4773 / 8653 | 55.16% |
| statements | 5388 / 9788 | 55.04% |
| functions | 1106 / 2071 | 53.4% |
| branches | 3066 / 5612 | 54.63% |

## Frontend combined

| Metric | Covered / total | Percent |
|---|---:|---:|
| lines | 8067 / 8653 | 93.22% |
| statements | 8930 / 9788 | 91.23% |
| functions | 1118 / 2071 | 53.98% |
| branches | 4826 / 5612 | 85.99% |

Frontend denominator: all 123 handwritten frontend/src TypeScript files including bootstrap. Specs and the two generated API client directories are excluded. Browser-only counters describe loaded source; they are not the full denominator.
Go: 13678 / 17015 statements. Go line/branch percentages are not measured.
External identity and native plugin/host source metrics are unmeasured. Other browser engines and hosted GitHub Actions execution are unverified.

## Historical observations

An earlier full cohort timed out during native-profile shutdown. Cause remains unknown; later passing evidence is reported separately and does not establish a causal repair.

Earlier attempts recorded zero drop callbacks. The contribution of historical disabled controls versus clipping remains unknown. The latest captured cohort uses stronger gesture/readiness assertions; its passing outcomes do not retroactively diagnose those earlier attempts.
Latest exact web gesture case evidence: UC-BRD-0048: passed, web=true; UC-BRD-0052: passed, web=true; UC-BRD-0053: passed, web=true; UC-BRD-0077: passed, web=true; UC-BRD-0078: passed, web=true.

Remaining frontend executable lines and branch-arm positions are in source-gaps.json. Native Go statement blocks are in go-statement-gaps.json; those are not independent line or branch measurements. No source text or private raw artifacts are included.

