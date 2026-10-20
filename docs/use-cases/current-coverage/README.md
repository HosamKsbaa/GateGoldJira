# Current test coverage

Target: **100%**. A mapped case is counted only after its exact assertions pass on the recorded source.

Read the [verification report](verification.md), [validation notes](validation-notes.md) and [remaining source gaps](source-gaps.md).

Verified cases: **1759 / 1772**. Verified on every declared surface: **1759 / 1772**.

Suite result: `passed`. Invalid evidence: `False`.

Browser execution scope: `full_unfiltered`; selected tests: 884; recorded attempts: 884; explicit timing opt-outs: 1.

Browser/API outcome coverage, frontend source coverage and Go statement coverage are separate measurements. They are not interchangeable or added together.

| Area | Passed cases | All cases | Every declared surface |
|---|---:|---:|---:|
| access | 59 | 63 | 59 |
| activity | 32 | 32 | 32 |
| assets | 86 | 86 | 86 |
| backlog | 41 | 41 | 41 |
| boards | 112 | 112 | 112 |
| collaboration | 137 | 137 | 137 |
| compatibility | 30 | 30 | 30 |
| configuration | 90 | 90 | 90 |
| fields-review-labels | 183 | 183 | 183 |
| integrations | 65 | 65 | 65 |
| issues | 203 | 203 | 203 |
| mcp | 110 | 113 | 110 |
| notifications | 70 | 72 | 70 |
| planning | 91 | 91 | 91 |
| platform | 29 | 33 | 29 |
| projects | 71 | 71 | 71 |
| relationships | 90 | 90 | 90 |
| transfer | 72 | 72 | 72 |
| workflows | 97 | 97 | 97 |
| workspace | 91 | 91 | 91 |

## Source coverage

```json
{
  "frontendDenominatorVerified": true,
  "frontendUnit": {
    "lines": {
      "total": 8639,
      "covered": 3737,
      "skipped": 0,
      "pct": 43.25
    },
    "statements": {
      "total": 9764,
      "covered": 4203,
      "skipped": 0,
      "pct": 43.04
    },
    "functions": {
      "total": 2067,
      "covered": 869,
      "skipped": 0,
      "pct": 42.04
    },
    "branches": {
      "total": 5576,
      "covered": 2525,
      "skipped": 0,
      "pct": 45.28
    },
    "branchesTrue": {
      "total": 0,
      "covered": 0,
      "skipped": 0,
      "pct": 100
    }
  },
  "frontendCombined": {
    "lines": {
      "total": 8639,
      "covered": 7915,
      "skipped": 0,
      "pct": 91.61
    },
    "statements": {
      "total": 9764,
      "covered": 8697,
      "skipped": 0,
      "pct": 89.07
    },
    "functions": {
      "total": 2067,
      "covered": 882,
      "skipped": 0,
      "pct": 42.67
    },
    "branches": {
      "total": 5576,
      "covered": 4630,
      "skipped": 0,
      "pct": 83.03
    },
    "branchesTrue": {
      "total": 0,
      "covered": 0,
      "skipped": 0,
      "pct": 100
    }
  },
  "goDenominatorVerified": true,
  "goStatements": {
    "covered": 13481,
    "total": 16851
  },
  "goStatementsPercent": 80.0
}
```

Go’s built-in coverage reports statements, not branch percentages. Frontend unit reports include unexecuted application TypeScript; browser reports cover loaded source and have documented navigation/context limits. Generated API clients and test code are excluded from frontend application metrics.

## Remaining cases

| Case | Outcome | Missing surfaces | Implementation |
|---|---|---|---|
| UC-ACC-0032 | not_run | web | external_pending |
| UC-ACC-0033 | not_run | web | external_pending |
| UC-ACC-0034 | not_run | web | external_pending |
| UC-ACC-0058 | not_run | mcp, rest, web | external_pending |
| UC-MCP-0075 | not_run | operator | external_pending |
| UC-MCP-0085 | not_run | operator, plugin | external_pending |
| UC-MCP-0111 | not_run | operator, plugin | external_pending |
| UC-NTF-0065 | not_run | background | external_pending |
| UC-NTF-0066 | not_run | background | external_pending |
| UC-SYS-0028 | not_run | operator, rest | external_pending |
| UC-SYS-0030 | not_run | operator, rest | external_pending |
| UC-SYS-0031 | not_run | operator, rest | external_pending |
| UC-SYS-0032 | not_run | operator, rest | external_pending |
