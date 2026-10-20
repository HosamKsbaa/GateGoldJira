# Migration 18 performance baseline

The follow-up migration 19 results are in [modern-completion-performance.md](modern-completion-performance.md). They retain this failed 200k baseline and record two passing corrected runs without increasing budgets.

Migration 18; authenticated REST/MCP calls, generated prepared queries and real
PostgreSQL/object storage. All values are local measurements, not cloud acceptance.

| Workload | Evidence | Result |
|---|---|---|
| 100k search, legacy/native generic/custom plans | search-retired.json | 26 scenarios, all p95 below 500 ms; slowest priority-ID sort 461.10 ms |
| 100k board rank tails, full/sparse/stale/unranked | boards-retired.json | 40 scenarios / 800 measured requests; slowest p95 358.95 ms |
| 100k single hot project / 100 active users | mixed-retired-native.json | Zero errors; p95 search 246.65, board 496.74, priority 435.70, comments 601.28 ms |
| 200k growth / 100 active users | growth-200k.json | Zero failed operations; board p95 637.45 ms exceeds the 500 ms target; other reads/saves remain within their targets |
| 10k multi-project, comments/history/inbox and 1 GiB real pictures | full-scale-retired.json | All pagination and regression budgets pass; 50 participating users plus the separate outsider fixture |

The mixed run records p50/p95/p99, errors, application pool waits and sampled heap
(about 77.4 MiB, pool maximum 10, no locks waiting at completion). The board mixed
margin is tight and there are ten samples; the prepared scenario suite supplies
additional repeated read evidence. Common-action 200/300 ms stretch goals are
not universally met. The 200k run identifies exact broad-board counting under
concurrent traffic as the next measured capacity boundary. Do not claim unlimited
scale, production latency or hosted cold-start acceptance.

A missing child-progress index caused an intermediate post-retirement regression.
Retirement now replaces status-dependent child and reminder indexes; native board
metadata/count paths avoid compatibility JSON. Failed intermediate reports remain
available alongside the corrected measurements.

Full browser acceptance: 144 cases passed, including warmed navigation, live
numeric/Arabic search, native backlog/rules, drag/drop, concurrency, uploads,
comments, permissions, saved drafts, conflict review and uncertain acknowledgements.
Navigation and typing timing files are copied alongside this report.
