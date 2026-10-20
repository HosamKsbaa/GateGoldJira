# Modern client and 200k local performance acceptance

Measured on the pinned toolchain, real isolated PostgreSQL and authenticated REST/MCP. Migration 19 adds one index; the schema still has 44 application tables. No latency budget was increased and no cache or mutable counter was introduced.

| Workload | Read/search p95 | Board p95 | Priority p95 | Comment p95 | Result |
|---|---:|---:|---:|---:|---|
| mixed-100k-completion.json | 232.01 ms | 440.67 ms | 398.43 ms | 643.02 ms | PASS, zero failed operations |
| growth-200k-completion.json | 328.65 ms | 455.40 ms | 392.60 ms | 593.29 ms | PASS, zero failed operations |
| growth-200k-completion-repeat.json | 338.71 ms | 405.00 ms | 370.03 ms | 524.64 ms | PASS, zero failed operations |

Before correction, the repeated 200k broad-board read had p95 629.17 ms (the previous recorded growth trial was 637.45 ms), above its 500 ms target. Actual generated card-page execution was 1.093 ms while exact counting took 71.713 ms and scanned 200k rows.

The compact partial `(project_id,stage_id)` index supports deduplicated keys and index-only counting. Per-mapped-stage counts avoid the broad hash/heap join and retain exact same-snapshot totals. The corrected plan took 18.401 ms with zero heap fetches; the page took 0.862 ms. Before and after plan JSON files are retained.

Prepared search: 26 generic/custom/native/legacy scenarios, slowest p95 422.33 ms. Prepared boards: 40 scenarios / 800 measured requests across full/sparse/stale/unranked views, slowest p95 331.16 ms.

The reports retain p50/p95/p99, error assertions, pool waits and sampled heap. The mixed board measurements contain ten samples per run; two separate 200k repetitions and the prepared scenario suite provide additional evidence. These are warm local loopback measurements, not universal or hosted capacity. The 200/300 ms stretch goals are not universally met.

The separate full 10k/1 GiB workload passed: 20 projects, 51 users (50 participants plus one outsider), 20k comments, 50k notifications/activity records and complete pagination. Upload p95 was 167.61 ms; a 50-concurrent-upload round took 1,320.99 ms. See `full-scale-completion.json`. Whole-suite/browser acceptance is recorded separately in [final verification](final-verification.md). Real provider/OAuth, Google storage/IAM, Cloud Run/Cloud SQL/idle-start and external paired restore acceptance remain pending.
