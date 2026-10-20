# Research: GateGoldJira Full MVP

**Date**: 2026-10-11 | **Scope**: all ten stories in [spec.md](spec.md)
**Status**: Research complete. Architecture selections are resolved; deployment account values and measured acceptance remain implementation gates.

## 1. Supported, pinned typed stack

**Decision**: Use the following researched release baseline. Implementation must create exact manifests/lockfiles and container digests, then compile a contract fixture before building features. These dependencies have been researched, not installed or tested together.

| Component | Selected version | Primary source |
| --- | --- | --- |
| Angular framework / CLI / CDK | 22.2.2 | [Angular](https://github.com/angular/angular/releases/tag/v22.2.2), [CLI](https://github.com/angular/angular-cli/releases/tag/v22.2.2), [CDK](https://github.com/angular/components/releases/tag/v22.2.2) |
| TypeScript / Node LTS / RxJS | 6.0.3 / 24.21.0 / 7.8.2 | [Compiler peer requirements](https://raw.githubusercontent.com/angular/angular/v22.2.2/packages/compiler-cli/package.json), [TypeScript](https://github.com/microsoft/TypeScript/releases/tag/v6.0.3), [Node](https://nodejs.org/en/download), [RxJS](https://github.com/ReactiveX/rxjs/releases/tag/7.8.2) |
| Go / Huma | 1.27.2 / 2.39.1 | [Go](https://go.dev/dl/), [Huma](https://github.com/danielgtaylor/huma/releases/tag/v2.39.1) |
| PostgreSQL / sqlc / pgx / goose | 18.6 locally; Cloud SQL major 18 / 1.31.1 / 5.11.0 / 3.28.0 | [PostgreSQL support](https://www.postgresql.org/support/versioning/), [sqlc](https://github.com/sqlc-dev/sqlc/releases), [pgx](https://github.com/jackc/pgx/releases/tag/v5.11.0), [goose](https://github.com/pressly/goose/releases/tag/v3.28.0) |
| Official Go MCP SDK | 1.8.0 | [Release](https://github.com/modelcontextprotocol/go-sdk/releases/tag/v1.8.0) |
| Hey API generator / Zod | 0.99.0 / 4.6.5 | [Generator](https://github.com/hey-api/hey-api/releases/tag/2026-06-22), [Zod](https://github.com/colinhacks/zod/releases/tag/v4.6.5) |
| Tiptap core / PM / selected extensions | 3.31.4 | [Release](https://github.com/ueberdosis/tiptap/releases/tag/v3.31.4) |
| bluemonday / x/net | 1.0.27 / 0.61.0 | [Sanitizer tags](https://github.com/microcosm-cc/bluemonday/tags), [x/net](https://pkg.go.dev/golang.org/x/net) |
| Auth0 Angular / Go JWT middleware v3 | 2.13.0 / 3.3.0 | [Angular SDK](https://github.com/auth0/auth0-angular/releases), [Go verifier](https://github.com/auth0/go-jwt-middleware/releases) |
| Cloud SQL Go connector / Cloud Storage Go SDK | 1.25.3 / 1.69.0 | [Connector releases](https://github.com/GoogleCloudPlatform/cloud-sql-go-connector/releases), [Storage SDK](https://pkg.go.dev/cloud.google.com/go/storage@v1.69.0) |
| UUID library | 1.6.0 | [google/uuid](https://github.com/google/uuid/releases/tag/v1.6.0) |
| Vitest / Playwright | 5.0.3 / 1.64.0 | [Vitest](https://github.com/vitest-dev/vitest/releases/tag/v5.0.3), [Angular build peers](https://raw.githubusercontent.com/angular/angular-cli/v22.2.2/packages/angular/build/package.json), [Playwright](https://github.com/microsoft/playwright/releases/tag/v1.64.0) |
| Terraform / Google provider | 1.16.5 / 8.6.0 | [Terraform](https://github.com/hashicorp/terraform/releases/tag/v1.16.5), [Provider](https://github.com/hashicorp/terraform-provider-google/releases/tag/v8.6.0) |

**Rationale**: Angular 22.2 requires TypeScript >=6.0 and <6.1; these Node/Go versions satisfy the researched dependency minimums. Use SQL files and sqlc with pgx/v5, rather than reflection-driven ORM models. Google manages Cloud SQL minor updates; local/CI patch and image digest are pinned and upgrade-tested. All transitive dependency versions and auxiliary CLI versions must be locked when manifests are created.

**Alternatives considered**: TypeScript 7 is outside Angular's peer range. PostgreSQL 17 is supported but adds no necessary advantage over the verified Cloud SQL 18 baseline. Do not track floating latest tags.

## 2. One contract source with runtime validation

**Decision**: Concrete Go service commands/results feed typed Huma DTOs and generated OpenAPI. Generate immutable TypeScript types, fetch SDK, and Zod validators with Hey API's SDK validator enabled. Map SDK results through small Angular feature services into typed forms/signals. Validate config and external identity/storage responses at their adapters. JSON-schema design files in contracts are planning references; the implemented Go DTOs generate the shipped schema, with compatibility checks against this design.

**Rationale**: Static checking across languages needs generated contracts, while JSON still needs runtime checks. Keep dates as calendar strings, UUIDs as validated IDs, revisions and issue numbers as decimal strings, empty collections as [], and nullable fields explicit. Full replacement commands avoid ambiguous omitted/null PATCH semantics. [Huma validation](https://huma.rocks/features/request-validation/), [OpenAPI](https://huma.rocks/features/openapi-generation/), [Zod generation](https://heyapi.dev/docs/openapi/typescript/plugins/zod), [fetch client](https://heyapi.dev/docs/openapi/typescript/clients/fetch), [sqlc pgx generation](https://docs.sqlc.dev/en/latest/guides/using-go-and-pgx.html).

**Alternatives considered**: Hand-maintained browser interfaces drift. The generator's Angular-specific client is documented as beta/Angular v20; its framework-independent fetch client avoids that extra dependency. No NgRx, Axios, generic repositories, or client permission authority.

## 3. Managed identity, current database permissions

**Decision**: Auth0 Universal Login, initially with a company-owned Google social connection, Authorization Code + S256 PKCE. Use one issuer and separate REST and MCP resource audiences. Bind validated issuer + subject to a pre-approved company account; never create company accounts from a login. A small TypeScript-authored, compiled Auth0 Action supplies trusted namespaced verified-email claims for first binding. Bind once transactionally, preserve the binding when account metadata changes, and never use client-supplied caller IDs. Disable password/public signup and unused connections.

REST audience is the canonical Cloud Run service URL plus /api; MCP audience is the same service URL plus /mcp. Publish protected-resource metadata and enable Auth0 Resource Parameter Compatibility. Start with a pre-registered demonstration MCP client or manually imported public CIMD; public DCR is disabled. A client requiring DCR must instead be explicitly configured with Auth0's domain-level connection and user-delegated grants. JWT middleware validates issuer/signature/audience/expiry/scope, SDK bearer middleware adapts the verified human subject, and PostgreSQL evaluates current account/project/ownership permissions on every action. Cache signing keys only.

**Rationale**: Remote MCP requires an OAuth resource flow in addition to browser login. Auth0's third-party clients do not receive OIDC ID tokens or userinfo, so the design does not depend on them. One coarse gategoldjira:access consent scope suffices; application roles stay in PostgreSQL. Auth0 advertises MCP on its Free plan, up to 25,000 users and five Actions; confirm actual tenant entitlements and workforce-use eligibility before deploying. Google credits cannot pay an external provider. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [Auth0 tenant profile](https://auth0.com/docs/get-started/tenant-settings), [third-party constraints](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls), [CIMD](https://auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd), [DCR](https://auth0.com/docs/get-started/applications/dynamic-client-registration), [custom claims](https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims), [Google connection](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google), [pricing](https://auth0.com/pricing).

**Alternatives considered**: Firebase/Identity Platform ID-token audiences target the Firebase project; they do not alone supply this dedicated MCP authorization flow (an integration inference). Self-hosted Keycloak adds a runtime; a homemade OAuth issuer adds unnecessary security work. A separate identity service is a managed integration, not another GateGoldJira application deployment.

## 4. Stateless MCP and bounded picture transfer

**Decision**: Official Go SDK Streamable HTTP at /mcp, Stateless=true, JSONResponse=true, no subscriptions/session affinity. Support SDK protocol 2026-07-28 and compatible 2025-11-25 clients. Typed generic AddTool inputs/outputs call the same services as REST. Limit the HTTP envelope to 16 MiB and explicitly configure MaxRequestBodyBytes, whose SDK default is 4 MiB.

For MCP, upload/download supported pictures using one base64 field per call; 10 MiB encodes to 13,981,016 bytes. Supply short explicit TextContent on binary outputs to prevent duplicated base64 serialization alongside structured results. Browser uploads use multipart, and downloads use authenticated streaming/blob references. Limit two heavy transfers per instance before large decoding/reading, propagate cancellation, and never log image bytes. These settings fit published 32 MiB Cloud Run HTTP/1 limits; memory and the chosen client's payload support must be tested. [SDK transport](https://github.com/modelcontextprotocol/go-sdk/blob/v1.8.0/docs/protocol.md), [SDK API/limits](https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk@v1.8.0/mcp), [Cloud Run quotas](https://cloud.google.com/run/quotas).

**Rationale**: No chunk store, Redis, background stream manager, or separate MCP process is needed. No signed/public read URLs: the backend must enforce revocation on every new read.

**Alternatives considered**: Stateful SSE/session storage complicates scaling. Signed downloads remain usable after revocation. Chunk sessions are unnecessary for the declared maximum but may be a separately scoped client-compatibility change later.

## 5. Safe HTML, Arabic and web interaction

**Decision**: Wrap vanilla Tiptap in one lazy Angular component with only required extensions. Canonicalize HTML with x/net/html, validate mentions/picture references against current issue permissions, and apply a narrow bluemonday allowlist last. Store safe HTML, derived plain text, and immutable versions/reference rows. Preserve Unicode and paragraph dir=auto/rtl/ltr. A typed rendering adapter handles supported nodes, bidi-isolated identifiers/mentions, and authenticated lazy picture fetches; no unsafe Angular bypass.

Use standalone components, typed reactive forms, signals/OnPush, lazy feature routes, stable-ID tracking and bounded lists. CDK dragging is paired with explicit keyboard status and Move Before/After controls. Inbox refreshes on opening/after relevant actions; no live synchronization dependency.

**Rationale**: The server owns formatting and permissions. Editor attributes stay at a validated boundary. WIP totals use full saved-view queries, not rendered-card counts. [Vanilla editor](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript), [direction](https://tiptap.dev/docs/examples/basics/text-direction), [sanitizer](https://github.com/microcosm-cc/bluemonday), [typed forms](https://angular.dev/guide/forms/typed-forms), [CDK](https://angular.dev/guide/drag-drop).

**Alternatives considered**: Raw arbitrary HTML, broad sanitizer presets, remote images, an Angular editor wrapper, paid collaboration, WebSockets and full Arabic UI translation are unnecessary or outside scope.

## 6. Transactional consistency without extra infrastructure

**Decision**: Short PostgreSQL transactions serialize project content changes on the project row, after a shared company-authorization guard; global account/admin changes take that guard exclusively. Caller-scoped retry claims precede project locks. Membership changes share project serialization. All records, versions, audits, eligibility cleanup and notifications commit together. Integer card ranks with gaps and bounded rebalance preserve hidden-card order. Derived blocked/overdue/progress/WIP values are queried, not cached.

**Rationale**: At this MVP size a coarse per-project write lock makes combined dependency/subtask cycles and parent-completion races understandable. Different projects still write concurrently; reads use MVCC. Load testing must show the lock does not violate latency. Specific locking/isolation rules are in data-model.md. [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [substring index](https://www.postgresql.org/docs/current/pgtrgm.html).

**Alternatives considered**: Distributed locks, a notification queue/outbox worker, event sourcing and cached permission/blocked counters are unnecessary. Finer-grained locks are considered only after measured project-lock contention and an updated race-test design.

## 7. Google Cloud placement, costs and recovery

**Decision**: europe-west1 for Go/SQL/pictures/registry; Firebase Hosting serves the SPA. Cloud Run request billing, second generation, 1 vCPU/1 GiB, concurrency 40, min 0/max 2, startup boost; ordinary deadlines 5s, picture 30s, platform timeout 60s. Start Cloud SQL Enterprise PostgreSQL 18, db-g1-small shared CPU/1.7 GiB, single zone, 10 GiB SSD, auto-growth capped initially at 50 GiB. This is a benchmark candidate; use dedicated db-custom-1-3840 if tuning cannot pass the stated workload. Use official connector lazy refresh + IAM DB authentication over its encrypted public-IP path, authorized networks empty, pgx maximum 10/minimum 0 per instance.

Actual SQL max_connections must accommodate 40 app connections for rollout/replacement plus separate migration/operations headroom. Use an application-role connection limit of 40 only after confirming capacity. Cloud Run may temporarily exceed max instances; controlled overload and pool acquisition deadlines prevent treating max 2 as a hard DB guarantee. [Run scaling](https://docs.cloud.google.com/run/docs/configuring/max-instances), [connector](https://docs.cloud.google.com/sql/docs/postgres/connect-connectors), [SQL editions](https://docs.cloud.google.com/sql/docs/postgres/choose-edition).

Use private uniform-access buckets with public-access prevention: staging and published storage have separate permissions. An hourly Cloud Scheduler call to the same backend's service-authenticated maintenance endpoint removes expired drafts/orphans and retry records in bounded batches. Draft authorization expires exactly at 24h; physical staging cleanup targets <=25h. Published objects remain immutable. Use 30-day published-bucket soft delete, daily SQL backups retaining 30, PITR/log retention 7 days, final/deletion-retained backups and deletion protection. Proposed measured recovery objectives: RPO <=5min, RTO <=4h; before-launch and quarterly isolated restore drills. Shared-core and single-zone SQL have no availability SLA. Dedicated single-zone adds capacity, not an SLA; HA dedicated Enterprise is the upgrade if availability requirements demand it. [SQL SLA](https://cloud.google.com/sql/sla), [PITR](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr), [restore](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore), [soft delete](https://docs.cloud.google.com/storage/docs/soft-delete), [lifecycle timing](https://docs.cloud.google.com/storage/docs/lifecycle).

**Rationale**: Region proximity/cost is an assumption; measure Cairo-to-region RTT rather than promising <=100ms. SQL is the main fixed cost. Min 0 is the cheap default; if idle-start p95 misses 5s after startup tuning, min 1 adds an estimated $13.14/mo gross idle floor before free-tier offsets and requires cost reforecast.

**Alternatives considered**: f1-micro is too constrained as the planned full-workload candidate. Enterprise Plus, HA, a VPC connector, Kubernetes, Redis and always-on workers increase cost without a stated current requirement.

### Monthly planning estimate before promotional credit

Assume 730h, 1M requests averaging 0.2s of billed instance activity, 10 GiB SQL, 10-30 GiB incremental backup use, ~1 GiB published originals plus staging/recovery copies, 25 GiB API/picture internet delivery, 2 GiB static delivery spread across days, <=6 active secrets/10k accesses and ~1 GiB logs.

| Item | USD/month allowance |
| --- | ---: |
| Shared-core SQL compute (0.035 x 730) | 25.55 |
| SQL SSD (10 x 0.17) | 1.70 |
| Backups (10-30 x 0.08) | 0.80-2.40 |
| Cloud Run min 0 | 0-8 |
| Internet delivery | 3-5 |
| Firebase Hosting at this daily distribution | approximately 0 |
| Picture storage/operations | 0.10-0.50 |
| Secrets, artifacts, logs, builds, hourly scheduler and drill contingency | 0-3 |
| **Pilot total** | **approximately 32-46** |
| **Min 1 variant** | **approximately 45-60** |
| **Dedicated single-zone SQL / min 0** | **approximately 56-70** |

These are published-baseline calculations, not an account quote. Recheck europe-west1 SKUs/currency in the calculator before provisioning; some pricing pages display default-region tables. Shared free tiers, object retention growth, traffic, staging environments, taxes/domains and identity-plan changes affect the total. [SQL pricing](https://cloud.google.com/sql/pricing), [Run pricing](https://cloud.google.com/run/pricing), [Firebase](https://firebase.google.com/pricing), [Storage](https://cloud.google.com/storage/pricing), [Secrets](https://cloud.google.com/secret-manager/pricing), [Registry](https://cloud.google.com/artifact-registry/pricing), [Logging](https://cloud.google.com/products/observability/pricing), [Scheduler](https://cloud.google.com/scheduler/pricing).

**Credit treatment**: The user confirmed $200 Google Cloud credit. Before spending, inspect the actual Billing Credits entry for remaining balance, eligible account/SKUs and expiry. No account benefit was verified here. Alerts use gross cost excluding credits and are notifications, not a hard spending cap. [Billing documentation](https://docs.cloud.google.com/billing/docs/how-to/resolve-issues).

## Research closeout

Every technical unknown identified before research has a concrete selection above: versions, generated validation, identity, MCP transport/pictures, formatting, storage/expiry, hosting capacity and recovery. Actual tenant configuration, URLs, billing eligibility and benchmarks are explicit implementation/deployment checks, not unresolved architecture choices. No infrastructure has been provisioned and no performance result is claimed.


## 13. Implementation verification — 2026-10-12

The local Go 1.27.2 and Node 24.21.0 archives were verified against official SHA256 checksums before use. npm peer metadata confirms Angular 22.2.2 accepts TypeScript 6.0.3 and Vitest 5.0.3; Auth0 Angular 2.13.0 accepts Angular >=13. Actual compile/contract results are tracked in tasks.md. No dependency version adjustment has been needed yet.

Immutable container index digests resolved from the official registries:

| Image | SHA256 digest |
| --- | --- |
| `golang:1.27.2-alpine` | `f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d` |
| `gcr.io/distroless/static-debian13:nonroot` | `e2e927ec666bae08560abb3c55d0659eceabb657f56b6782ab500a9fc7f555e3` |
| `postgres:18.6` | `74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336` |

The frontend lockfile overrides the generator’s transitive `js-yaml` dependency to **4.3.2**, the compatible patched release for [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh). The initial audit reported four high-severity dependency-chain findings; the patched lockfile reports zero vulnerabilities. Angular strict compilation/production build and the separate strict identity compilation/build passed. PostgreSQL 18.6 started healthy using the pinned Compose image.

**Compiler compatibility adjustment**: Hey API 0.99.0’s supported bundled fetch runtime does not compile with the optional TypeScript `exactOptionalPropertyTypes` flag. The frontend uses TypeScript `strict: true`, `strictTemplates`, `noUncheckedIndexedAccess` and the other agreed strict checks, without that additional opt-in flag. Required nullable DTO fields remain required in generated types and runtime schemas; missing fields, invalid dates/enums and numeric revisions are tested and rejected. Identity’s separate workspace retains its compatible optional-property check. This changes no agreed language, dependency pin or constitution requirement. The deprecated standalone fetch package is not used.

CI action commits are pinned to the resolved `actions/checkout`, `actions/setup-node` and `actions/setup-go` v6 commits. The vulnerability scanner is pinned to `golang.org/x/vuln/cmd/govulncheck@v1.9.0`; the setup source scan reports no vulnerabilities.

### Auth0 Action build verification

The verified-email Action compiles separately to CommonJS for the managed Node22 runtime with the existing pinned Zod4.6.5 dependency. Local tests verify Google-only connection data and verified-only namespaced email claims; they do not replace tenant execution/OAuth acceptance. Auth0 requires compiling TypeScript before deployment and declaring module versions. [Auth0 TypeScript/Actions](https://auth0.com/docs/customize/actions/actions-npm), [runtime/dependency API](https://auth0.com/docs/api/management/v2/actions/post-action). No Action has been uploaded.

### Local implementation compatibility checks (2026-10-12)

The pinned Hey API Fetch client converts request header records to real `Headers` before calling generated request validators; the generated Zod header schema expects named properties. `core/api/client.ts` adapts only that validator input for POST/PUT, retaining the generated generic client types and all generated body/path/query/header/output checks. A regression test proves a valid UUID reaches HTTP and an invalid reference never reaches fetch. Generated code stays untouched; disabling header schema output did not resolve SDK-generated validation and is not used. [Hey API Zod request schemas](https://heyapi.dev/docs/openapi/typescript/plugins/zod) describe the generated layers.

Angular gives the `PORT` environment variable priority over `--port`; the browser harness explicitly passes its web port to the child server, uses distinct free API/web ports, and refuses server reuse. Native file-watchers were exhausted on this machine; Angular's supported `poll:1000` option permits startup without changing system limits. Production builds do not use polling.

Pinned Zod4.6.5 counts non-BMP strings in Unicode code points for length limits. Tests accept100 emoji characters and reject101, preserving the server's Unicode length semantics and positive revision strings above JavaScript's exact integer range.

### Issue checkpoint compatibility notes

- SQL timestamps decode in UTC through pgx’s connection type map; the session timezone alone does not control binary decoding. A real PostgreSQL regression simulates a Cairo-time machine and checks the canonical Z-suffix wire date.
- Counts use bounded int32 DTOs so Hey API’s generated Zod parser and TypeScript number type agree. Revisions and permanent issue numbers retain decimal-string bigint precision.
- The pinned Zod 4.6.5 implementation measures string limits in Unicode code points. A generated IssueEditable regression accepts 200 emoji and rejects 201; no custom string generator or manual generated edits are needed.
- Contract export writes temporary files first so a registration failure cannot truncate the last successful OpenAPI artifact.
