# Validation notes and remaining work

Recorded on 20 October 2026. See [verification.md](verification.md) for measured results, [source-gaps.md](source-gaps.md) for frontend gaps and [go-statement-gaps.md](go-statement-gaps.md) for native Go gaps.

## Verified locally

- The full, unfiltered Chromium cohort selected 888 tests: **887 passed, zero failed, one timing test explicitly skipped**. There were zero retries. That timing test passed separately without coverage instrumentation.
- All **1,768 locally eligible documented cases passed on every declared interface: 3,378 verified case/interface pairs**. The complete catalog contains 1,781 cases; 13 actual provider or supported-host acceptance cases remain pending.
- The complete frontend unit run passed **1,000 tests across 74 files**. Strict test TypeScript checks, application compilation and the production build passed.
- The complete **39-package Go race-enabled suite passed**. An independent official no-test instrumentation run validated the complete native statement denominator.
- Tooling regressions passed **173 Python tests and 16 Node tests**. Architecture checks, Go vet and generated REST/MCP/SQL/TypeScript consistency checks passed. Contract regeneration ran inside an isolated captured source copy.
- The identity package passed 30 local unit cases; the portable integration plugin passed its 16 unit tests. These do not establish actual provider or installed-host acceptance, or complete source percentages for those packages.

The browser cohort exercises actual local web, REST and MCP behavior against isolated PostgreSQL and local storage. It also tests the real hosted-password mode with operator provisioning, current account approval, a canonical HTTPS fixture origin and PostgreSQL verify-full TLS. That local fixture does not establish a deployed VM, public certificate, Google/Auth0 tenant, SMTP provider or cloud storage target.

Node component tests exercise public state and service behavior before DOM initialization; browser tests provide actual DOM and rich-editor interactions. Chromium is the verified browser engine. Other engines, physical devices and hosted GitHub Actions execution remain unverified. CI configuration and local checks are not evidence of a hosted CI run.

Catalog coverage includes expected rejection of unavailable operations. Eleven cases explicitly verify boundaries for features classified as not implemented. Passing them does not implement those features or establish complete Jira parity. Some service capabilities have no corresponding native web action.

## Repairs covered by regressions

- Delayed upload-cancellation acknowledgements cannot restore a previous account's private queue after component destruction or an account change.
- Accepted label creation clears an unchanged name and preserves a newer unsent label draft.
- Obsolete project replies cannot initiate unsigned board discovery or cancel a replacement login. Protected requests retain their original session ownership while waiting for authentication and response parsing.
- Owned captured migration commands reuse their genuine parent storage lease. Exact paths, manifests, held locks and registered output ownership are required; budgets and concurrency limits remain enforced. The real Make migration/restart check and the full migration package passed.
- The storage signal handler records cancellation without re-entering a child wait lock. A deterministic OS-boundary regression reproduced the lock race before the repair; the original shutdown deadline and owned-descendant grace were preserved.

## Source target remains incomplete

| Measurement | Covered / total | Result |
|---|---:|---:|
| Combined frontend executable lines | 8,067 / 8,653 | 93.22% |
| Combined frontend branch arms | 4,826 / 5,612 | 85.99% |
| Combined frontend statements | 8,930 / 9,788 | 91.23% |
| Combined frontend functions | 1,118 / 2,071 | 53.98% |
| Go native statements | 13,678 / 17,015 | 80.4% rounded |

The frontend denominator contains all 123 handwritten runtime TypeScript files, including bootstrap. Specs and the two generated API directories are excluded. Unit and browser counters combine only when source hashes and exact mapped spans agree. Incompatible compiler mappings receive no additional credit; a remaining counter does not itself prove a missing feature. Browser-only loaded-source percentages use a different denominator and are not the full source result.

Remaining measured gaps are **586 frontend executable lines, 786 frontend branch arms and 3,337 Go statements across 3,009 native blocks**. Complete positions are recorded in the linked JSON and Markdown gap reports, with no source text. Unavailable frontend compiler-map positions remain null. Go's native denominator includes generated and test-support packages; its blocks must not be interpreted as independent line or branch coverage. Go line/branch percentages and complete identity/plugin source metrics remain unmeasured.

The strict 100% gate was run against complete, valid evidence and **failed**: both source denominators were verified, while source targets and external acceptance remain incomplete. This is a target failure, not a passing 100% result. Further work includes assertions for the recorded source gaps, trustworthy independent Go line/branch measurement, complete identity/plugin source measurement and actual external acceptance. See [external-acceptance.md](../external-acceptance.md) for prerequisites.

## Uninstrumented local performance

The separate Chromium run passed 100 warmed journeys per operation on the local development server and small fixture: project p95 **150.72 ms**, board p95 **392.30 ms**, each against a **2,000 ms** budget. See [performance.json](performance.json). These are not cold-start, deployed or 200,000-issue browser measurements.

A separate current-source backend benchmark passed against **200,000 canonical issues in one project and 100 simultaneous users**, with actual authenticated REST and MCP calls and no recorded errors:

| Operation | Trials | Local p95 | Budget |
|---|---:|---:|---:|
| Search | 1,000 | 333.49 ms | 500 ms |
| Broad board reads | 10 | 459.54 ms | 500 ms |
| Priority writes | 200 | 400.87 ms | 750 ms |
| Comment writes | 100 | 598.72 ms | 750 ms |

The small board sample and local environment limit that conclusion. See [scale-performance.json](scale-performance.json). This benchmark is separate from coverage instrumentation, browser rendering and cloud acceptance.

## Historical failures and evidence

An earlier complete browser attempt had three failures and is excluded from these results. The project-pagination test observed request starts and could advance the same cursor before a response committed. Its replacement waits for completed, typed page responses and rendered publication while retaining distinct cursor and option-growth assertions. Back-navigation coverage now verifies rendered destinations and ready return controls, and fails on unexpected confirmation dialogs. The exact historical navigation trigger was not captured; stronger synchronization does not establish a causal product repair for that earlier observation.

That earlier attempt also recorded eight uncaught page errors during an otherwise successful approval story. Their messages and stacks were not retained, so the cause remains unknown. The complete 39-test discovery/approval run and the fresh full cohort passed without those errors. Private runtime-error diagnostics now retain details if they recur; the public assertion remains opaque. No runtime repair is claimed for that unexplained historical failure. Earlier native-profile shutdown and drag observations remain qualified in [verification.md](verification.md).

Published files contain curated case reports, counters, hashes and source positions. Producer-bound profiles, source snapshots, logs, runtime diagnostics, test uploads, credentials and raw results remain private. The public folder alone is not a self-contained strict-gate input. The latest full source snapshots, shard dependencies, unit/Go proofs and timing/scale evidence are retained; managed cleanup removed the superseded failed cohort after preserving bounded private case/source receipts. Application databases, database volumes, identities and user uploads were preserved.
