# Readiness gates

The October 15 refactor and follow-up acceptance is complete. Its existing-company adoption verified migration 19 with 44 application tables at that date. October 16 code-quality follow-up verification is recorded in [code-quality corrections](code-quality-corrections.md). The current source also includes separate MCP-token/browser OAuth work with migrations 20–22; these checks do not apply it to the existing company. [Final verification](final-verification.md), [adoption](adoption-completion.json) and [performance acceptance](modern-completion-performance.md) distinguish dated local evidence from external acceptance.

## Completed local acceptance

- Complete real PostgreSQL Go race suite and vet; shared 133-operation / 71-mutation REST/MCP replay, restart, revocation and permission matrix.
- Reproducible generated models, feature boundaries, strict Angular app/test typing, 105 unit tests, production build and 153 browser cases at October 15 acceptance. The October 16 follow-up has 114 frontend unit tests, three source-capture regressions and 163 browser cases; its actual results and whole-package Go race coverage are recorded in the code-quality report.
- Native private saved-search management with exact multi-value filters and protected retries; scoped bulk actions with selected-field CAS, partial failure review and navigation recovery.
- Administrator readiness/explicit activation with defaults, workflow paths, canonical references and default-board coverage checks; stale-review and role denial; shared REST/MCP outcomes. Current canonical writes can also promote legacy projects. No public downgrade endpoint is exposed.
- Backed-up live migration 18 → 19, all 44 source projections exactly equal, original accounts/mode/work and 16 accepted receipts retained, API/web readiness and authenticated compatibility/readiness/file smoke checks.
- Fresh private paired backup and isolated restore: all 44 projections, 15 object files and four published asset SHA/size/generation identities verified.
- Prepared search/board, 100k/100-active-user and two 200k/100-active-user hot-project workloads pass with zero failed operations. Corrected 200k broad-board p95 is 455.40 and 405.00 ms against the unchanged 500 ms read target. The exact count plan improved from 71.713 to 18.401 ms with zero heap fetches.
- Full 10k/1 GiB multi-project/media/pagination workload passes. Warm local browser project/board navigation p95 is 123.87/590.85 ms; typing-search p95 is 204.38 ms.

## Local limits

These are warm local loopback measurements. Mixed board runs contain ten samples each; separate repetitions and prepared scenarios provide additional evidence, but not unlimited capacity. The 200/300 ms stretch goals are not universally met. Original failed 200k baseline reports remain available.

The October 16 production build has a 545.24 kB initial bundle (135.38 kB estimated transfer). It passes the unchanged 600 kB soft and 1 MB hard budgets. The historical October 15 603.85 kB warning is no longer current.

The first-party issue list, detail and boards now use the native UI. [Client boundary](native-client-boundary.md) explains automatic promotion during canonical writes, administrative activation, in-memory draft lifetime, 100-issue scoped batches and workflow limitations. No existing-company adoption or reseeding was performed by the October 16 corrections.

The in-app browser security policy blocked inspection of the existing local tab. No alternate browser/protocol was used to bypass it. Live authenticated API/data/object checks and the separate isolated browser suite passed; manual visual inspection of that existing tab remains unverified.

## External acceptance remains pending

- Real Auth0/Google company sign-in and MCP OAuth resource/client flows. The user has no development tenant yet and authorized local test identities.
- Real Google Cloud Storage resumable transfers, IAM boundaries, generation/SHA verification and interrupted-session recovery against the intended staging/published buckets.
- Cloud Run/Cloud SQL latency, memory and scaling under declared concurrency, including idle-start navigation, network distance and service/database connection limits.
- A complete external paired database/object restore drill: retained references, generation identities, accepted receipt replay and current authorization must pass in an isolated target before reopening traffic or cleanup. The successful local restore does not close this gate.
- Deployment/billing configuration for the authorized Google Cloud project. No unknown account, tenant, project or bucket was provisioned.

These gates require the actual authorized targets and credentials. Local acceptance does not establish production readiness or hosted speed.
