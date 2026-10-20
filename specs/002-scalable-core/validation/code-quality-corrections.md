# Code quality corrections — 2026-10-16

The four reviewed defects are corrected. These corrections add no production dependencies or schema migrations. Separate MCP-token/browser OAuth changes through migration 22 are included in the current-source rechecks; this task does not migrate or reseed the existing company.

## Changes

- Vitest's module cache option uses the supported `test.fsModuleCache` configuration. Strict app/test compilation succeeds.
- A narrow route reuse strategy recreates snapshot-based configuration, workflow, custom-field and membership editors when their project changes. Same-project reuse, dirty-draft cancellation and destination access guards remain covered.
- Bulk stage and priority targets must belong to the current active choices. Project/workflow switches discard stale targets and invalidate late replies, while same-workflow pagination and frozen uncertain retries remain intact.
- `make db-migrate` invokes the existing guarded owner CLI. The regression upgrades populated migration-10 issue/comment/image/document data, preserves revision `9007199254740993` and canonical references, then repeats the command safely. It verifies the parsed connection selects its disposable fixture before invoking Make.
- CI has a separate Chromium/PostgreSQL job, timing checks, pinned setup actions/tools, source-capture regressions, a 30-minute bound and unconditional disposable-container cleanup. It installs the pinned `mcp-remote@0.15.1` test bridge with package scripts disabled and enables its real OAuth/stdio acceptance instead of skipping it. Backend race tests run one package at a time with a 30-minute executable limit inside a 45-minute job. Private identities, files and traces are not uploaded. The workflow is configured and structurally checked; remote GitHub execution awaits commit/push.

The complete browser suite had retained legacy UI/API assumptions after the native routes were introduced. Scenarios now use actual canonical IDs, native columns, current saved-search controls and original-request retries. Cases were retained. Compatibility seeding resets only the disposable Demo project; activation scenarios own separate projects and exercise the public service.

Retained scenarios exposed additional native regressions, which are corrected: preview naming and card-body opening, rapid status navigation and precise workflow order, create focus, unfinished-prerequisite details, grouped pagination, destination-column loading after moves, backlog creation intent, repeated global creation, filter dismissal and mobile column navigation. Priority menus now preserve keys arriving before their first choice page, clear cross-issue caches and reject superseded replies. A deliberately held real HTTP response verifies no premature write and one intended save after choices arrive. Saved-search success notices clear when another save starts; a held-response regression proves an older success cannot acknowledge an in-flight update.

## Verification

| Check | Result and local evidence |
|---|---|
| Strict Angular app/templates and test TypeScript | PASS. `quality-last-types.log`, `quality-proxy-final-types.log`. |
| Frontend unit tests | PASS: 114 tests / 22 files. `quality-last-units.log`. |
| Identity action typing/build/unit | PASS: 1 test. `quality-finished-identity.log`. |
| Source-capture regressions | PASS: 3 tests. Generated imports survive replacement; existing destinations are preserved; backend catalogs and SQL grants are captured. `quality-capture-final-tests.log`. |
| Production Angular build | PASS: initial 545.24 kB / 135.38 kB estimated transfer, below the unchanged 600 kB soft and 1 MB hard budgets. `quality-last-build.log`. |
| Browser acceptance | 163 scenarios verified across complete-suite and focused runs. The latest 162-case complete run had 160 passes and two failures: stale saved-search success feedback and traced navigation timing. Both were corrected and rechecked. The subsequent 20-case run passed 19 cases, including all affected saved-search/bulk/editor scenarios and timing; its new proxy test's duplicate-name selector was corrected, then all four MCP/saved-search followups passed without skips/flaky results. `quality-clean-browser.json`, `quality-final-followups.json`, `quality-proxy-complete.json`. Layout/keyboard scenarios also passed three repetitions each (`quality-layout-final-browser.log`). This is combined acceptance, not a claim that an earlier failed whole-suite command exited successfully. |
| Delayed-response browser regressions | PASS: priority navigation/selection scenarios × 3, delayed-create navigation × 3, Arabic custom-field conflict × 3. `quality-priority-quiet-browser.log`, `quality-navigation-recheck.log`, `quality-fields-recheck.log`. |
| Real PostgreSQL Go race coverage | All 31 test packages have passing runtime coverage across isolated runs. The complete REST/MCP parity package passed in 1,461.298 s. Current affected app/auth/command/attachments/MCP/migration packages passed fresh race runs; current contract and integration packages passed in 42.420 / 164.305 s after fixture corrections. `quality-go-runtime-coverage.json` maps package evidence. |
| Current test-tree compilation, vet and dependency scan | PASS: every test package compiles; vet has no diagnostics. Go scanning finds zero affected call paths and one advisory in a required module outside the application's call paths. Frontend/identity/proxy audits report zero vulnerabilities. `quality-workspace-final-compilation.log`, `quality-workspace-final-vet.log`, `quality-workspace-final-vulnerabilities.log`, `quality-proxy-audit.log`. |
| Generated contracts and architecture | PASS on current OAuth source. `quality-oauth-generated.log`, `quality-oauth-architecture.log`. |
| Runner guards | PASS: hosted fixture creation and migration without an owner connection are refused. `quality-runner-guards.log`. |

Log filenames above are in ignored `.local/`. [Structural results](code-quality-results.json) record counts and acceptance boundaries without identities or credentials. Test identities, credentials, uploads and traces remain private.

The focused local development-server timing checks pass the unchanged 2,000 ms p95 bounds: project navigation 882.67 ms (100 samples), board navigation 1,836.61 ms (100); typing an exact key to visible results was 478.46 ms (20) in the complete run. The navigation probe followed the 205-card and project-editor fixtures. Timing now excludes trace recording; functional scenarios retain failure traces. The earlier traced timing failure measured 2,108.86 ms while collecting 3,055 DOM snapshots / 86.1 MiB of trace data. No latency budget was raised. These are shared-host development measurements, separately from historical 100k/200k server workloads. They do not establish hosted latency or universally meet the 200/300 ms stretch goals.

## Test isolation and corrected verification failures

The runner captures source, generated contracts, tests, design catalogs and SQL grants together, verifies a SHA-256 manifest and compiles the private copy once. Installed tools/caches are shared. Application/test source stayed stable during the final acceptance snapshot; an unrelated MCP setup script changed separately.

Earlier attempts are not counted as acceptance: concurrent migration-test renaming invalidated a compile; concurrent OAuth generation temporarily mismatched contracts; a resource-constrained broad Go run hit setup deadlines; an initial Go snapshot omitted catalog/grant fixtures. Fresh package runs and whole-tree compilation replace those results. Combined package coverage does not imply those earlier commands exited successfully.

One existing pool test reopened pgx's original driver DSN after changing the fixture database field. That could falsely pass against a populated source. It now constructs the actual disposable URL and asserts `current_database()` is its own fixture. The Make migration regression independently checks its parsed target before any migration. Layout, delayed-create and field-conflict tests now await their actual loaded/persisted outcomes rather than transient DOM states. The real proxy case selects the active connection and scopes activity/revocation actions to it, so earlier revoked connections do not make selectors ambiguous. Its browser consent, credential cache, forced-expiry refresh, tool calls, audit entries and revocation all pass.

A private `gg_quality_*` driver and per-test databases isolate Go checks. The quality driver was removed after all checks completed. Browser runs own fresh `gg_browser_*` databases and clean them up. An early command naming the company as connection source was rejected by automatic approval review and not executed; the replacement driver was independently created. The first migration-regression draft accidentally selected only that disposable driver, was corrected, and is not accepted evidence. No company data or Docker volume was removed.

## Remaining external acceptance

Real Auth0/Google OAuth, GCS/IAM, Cloud Run/Cloud SQL latency and idle-start behavior, billing and an external paired restore remain pending. Local browser OAuth acceptance does not close those provider/deployment gates. The existing-tab browser security policy still blocks manual visual inspection; no alternate browser or protocol bypass was used. Isolated browser acceptance supplies frontend evidence.
