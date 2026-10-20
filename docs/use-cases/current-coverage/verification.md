# Verification

This report does not claim 100% coverage.

See [validation notes](validation-notes.md) for the additional checks, performance limits and work remaining to reach the requested target.

Browser cohort: 884 selected; 883 passed; 0 failed; 1 skipped. Scope: full, unfiltered Chromium; no retries.
Explicit coverage-instrumented timing opt-outs: 1. Performance is a separate uninstrumented measurement.

| Scope | Passed cases | Every declared surface | Verified interface pairs |
|---|---:|---:|---:|
| Entire documented catalog | 1759 / 1772 | 1759 / 1772 | 3367 / 3388 |
| Documented local cases | 1759 / 1759 | 1759 / 1759 | 3367 / 3367 |

Thirteen actual provider/supported-host cases remain external pending: UC-ACC-0032, UC-ACC-0033, UC-ACC-0034, UC-ACC-0058, UC-MCP-0075, UC-MCP-0085, UC-MCP-0111, UC-NTF-0065, UC-NTF-0066, UC-SYS-0028, UC-SYS-0030, UC-SYS-0031, UC-SYS-0032.

## Frontend unit

Successful full unit run: 781 passed tests across 64 files.

| Metric | Covered / total | Percent |
|---|---:|---:|
| lines | 3737 / 8639 | 43.25% |
| statements | 4203 / 9764 | 43.04% |
| functions | 869 / 2067 | 42.04% |
| branches | 2525 / 5576 | 45.28% |

## Frontend combined

| Metric | Covered / total | Percent |
|---|---:|---:|
| lines | 7915 / 8639 | 91.61% |
| statements | 8697 / 9764 | 89.07% |
| functions | 882 / 2067 | 42.67% |
| branches | 4630 / 5576 | 83.03% |

Frontend denominator: all 123 handwritten frontend/src TypeScript files including bootstrap. Specs and the two generated API client directories are excluded. Browser-only counters describe loaded source; they are not the full denominator.
Go: 13481 / 16851 statements. Go line/branch percentages are not measured.
External identity and native plugin/host source metrics are unmeasured. Other browser engines and hosted GitHub Actions execution are unverified.

## Historical observations

An earlier full cohort timed out during native-profile shutdown. Cause remains unknown; later passing evidence is reported separately and does not establish a causal repair.

Earlier attempts recorded zero drop callbacks. The contribution of historical disabled controls versus clipping remains unknown. The latest captured cohort uses stronger gesture/readiness assertions; its passing outcomes do not retroactively diagnose those earlier attempts.
Latest exact web gesture case evidence: UC-BRD-0048: passed, web=true; UC-BRD-0052: passed, web=true; UC-BRD-0053: passed, web=true; UC-BRD-0077: passed, web=true; UC-BRD-0078: passed, web=true.

Complete remaining frontend executable lines, statement/function locations and branch-arm positions are in source-gaps.json. No source text or private raw artifacts are included.

