# Performance evidence

Status: deterministic full-scale local workload and100trials/action pass. Cloud SQL shared tier, actual user network, idle-start Cloud Run, cloud browser/render, overload/temporary extra instances and selected assistant max-image measurements remain pending. T145/T146 stay unchecked. No tier/min-instance change is justified by a local result alone.

Run `make test-performance` (alias `make test-perf`). It creates/drops its own gg_test_* PostgreSQL database, starts a signed-human HTTP app, uses project-owned temporary storage and removes its actual immutable fixture pictures on exit. Dataset:50 users,20projects,10kissues/2kchildren/max2k per project,20kcomments/max500 per issue,60boards,1kdependencies,1kpictures of1MiB each,200labels,5kdated issues,50kinbox/50kactivity,4kArabic issues. IDs/content are deterministic; isolated runtime identities/server ports vary. SQL ANALYZE runs before timings. All issue counters, label memberships, parent links and safe comment versions are valid. Full unchanged traversal retrieves all10kissues,50kpersonal notifications,50kAdmin events and500comments exactly once before writes.

Local run2026-10-12, Go1.27.2/PostgreSQL18.6, loopback HTTP on the developer machine, actual authentication and max10-connection application pool. Angular browser timings use a separate smaller fixture. This machine is not the1vCPU/1GiB Cloud Run/db-g1-small target.

| Action | Trials | p95 milliseconds |
| --- | ---: | ---: |
|Project list|100|4.85|
|Issue detail|100|5.55|
|Arabic/label search|100|33.35|
|Board counts on2kissues|100|8.05|
|Bounded board page|100|23.03|
|Comments page on500comments|100|10.07|
|Inbox summary on50kentries|100|22.04|
|Inbox page on50kentries|100|31.64|
|Admin history on50kevents|100|16.55|
|Labels|100|4.85|
|Issue update|100|9.27|
|Issue create|100|7.28|
|Comment commit +next authorized inbox read|100|15.10|
|Maximum10MiB multipart upload|100|430.02|
|Private1MiB download|100|28.86|
|Round of50simultaneous board requests|100|129.99|

The ignored raw report `.local/performance/local.json` includes p50/p95/max/trials, observed Go heap (~72MiB), cumulative pool acquire/wait statistics and zero waiting locks at completion. Heap includes the in-process test client/server and sampling does not prove peak container RSS or in-flight lock wait. Earlier runs during concurrent verification showed isolated download outliers above1s; the latest retained run records every maximum and p95. Warm-ups are excluded; revision-preparation reads are outside write timings. The concurrent round statistic is completion of all50requests, not an independent request percentile. No cloud acceptance is claimed.

`RUN_BROWSER_PERFORMANCE=1 bash scripts/run-browser-tests.sh performance.spec.ts` measures100 warmed project/board SPA navigation actions and card bounds on the small isolated browser fixture. It uses the Angular development server and signs in once through local test identities. Do not count it as the full-scale cloud browser gate or a30minute idle-start test.

For the future authorized target, collect each ordinary read/write plus move/reorder/subtask/comment edits/inbox mutations with>=100trials, actual10MiB upload/selection-to-confirmation, max-image MCP once without duplicate base64, two-transfer saturation, per-card SQL query counts, EXPLAIN ANALYZE/BUFFERS plans, lock waits, application pool and container RSS. Record exact region, image/revision, SQL tier, min/max instances, browser/laptop, bandwidth>=10Mbps/RTT<=100ms, seed, query mix and network. Measure cold first board after30minutes idle independently across enough trials; never substitute local startup time. Pause any automatic warmers during the idle measurement and record Scheduler effects.

Budgets: warm web p95<=2s; idle-start<=5s; warm API read<=500ms/write<=750ms; max-picture>=100uploads p95<=30s; producer-to-next-inbox>=100 p95<=5s. Failures remain unresolved. Tune owning query/index/render/startup/pool code only after observation; benchmark/cost-review dedicated SQL/min1 if tuning cannot meet the target, then repeat affected checks. Preserve prior failed reports. No actual Cloud benchmark or cost-selected alternative has run.

Separate small-fixture browser run:100project navigations p95=107.77ms;100board navigations p95=352.87ms. Full browser acceptance:27pass, timing harness opt-in by default. No real employee completion or cloud browser result is inferred.

Maximum image official MCP SDK transfer also passes locally:exact10MiB input JSON13,981,257bytes; entire download JSON13,981,659bytes, one base64 field and byte-for-byte equality, below16MiB. The Go race-instrumented upload+download took13.46s; this is one compatibility trial, not100cloud/actual-assistant samples.


## Daily workflow rerun (2026-10-13)

The full deterministic local workload passed after adding archived/backlog predicates, sorted search, issue-reader history and watcher delivery. All unchanged traversals passed; the dataset and timing boundaries remain those above. Wall time:148.70seconds. No cloud environment is inferred.

| Action | Trials | p95 ms | Local budget ms |
| --- | ---: | ---: | ---: |
|project-list|100|5.53|500|
|issue-detail|100|5.76|500|
|issue-search-Arabic-labels|100|43.51|500|
|board-counts-2000-issues|100|7.78|500|
|board-page-bounded|100|21.40|500|
|comments-page-500-comments|100|9.42|500|
|inbox-summary-50000|100|20.49|500|
|inbox-page-50000|100|30.27|500|
|activity-page-50000|100|13.27|500|
|labels-page|100|4.73|500|
|issue-update|100|9.17|750|
|issue-create|100|7.79|750|
|comment-and-next-inbox|100|15.91|5000|
|picture-upload-10MiB|100|423.53|30000|
|picture-download-1MiB|100|27.77|500|
|50-concurrent-users-round|100|167.59|5000|

Observed Go heap sample peak: 106.26 MiB; application pool maximum: 10; waiting locks at completion: 0. These snapshots do not measure peak container RSS. The raw report remains `.local/performance/local.json`.

The final daily-workflow browser benchmark (full50-test run) passes100project navigations at p95=122.05ms and100board navigations at p95=558.02ms, both below2seconds. This uses the local Angular development server and isolated fixture, not a cloud/cold-start measurement.
