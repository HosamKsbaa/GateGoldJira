# Implementation Plan: GateGoldJira Full MVP

**Branch**: Existing Git checkout preserved. Feature context: `001-gategoldjira-mvp`.
**Date**: 2026-10-11 | **Spec**: [spec.md](spec.md) | **Constitution**: [v1.0.0](../../.specify/memory/constitution.md)
**Status**: All ten business stories are implemented and verified locally as of2026-10-12. External OAuth/assistant/usability/account/cloud measurements remain release gates. Evidence and performed task status are recorded in [validation/readiness.md](validation/readiness.md) and [tasks.md](tasks.md).
**Input**: Full MVP specification in specs/001-gategoldjira-mvp. Local application implementation is complete; cloud resources are prepared for review and have not been provisioned.

## Summary

Build all ten stories with a separately deployable Angular SPA and one modular Go backend. REST and remote MCP call the same typed feature services and PostgreSQL transactions. Firebase Hosting serves Angular; Cloud Run hosts Go; Cloud SQL stores company records; private Cloud Storage stores pictures. Auth0 supplies managed human login and standard MCP OAuth, with approval, roles and current permissions authoritative in PostgreSQL.

The MVP includes company/project roles, projects and issue assignments, named filtered Kanban boards with shared drag/keyboard ordering, To Do/In Progress/Review/Done, soft WIP warnings, blockers, dates/labels, one-level subtasks, safe HTML comments with pictures/Arabic/mentions, a personal in-app inbox, retained history, retries/conflicts, and full web/MCP access. Every story is required; delivery order does not reduce scope.

## Technical Context

**Language/Version**: Strict TypeScript6.0.3, Angular22.2.2/Node24.21.0 LTS; Go1.27.2. Exact manifests, locks and container digests are implementation deliverables; researched pins are in [research.md](research.md).

**Primary Dependencies**: Angular standalone components/signals/typed forms/CDK; Tiptap3.31.4; Huma2.39.1 on net/http; official Go MCP SDK1.8.0; sqlc1.31.1/pgx5.11.0/goose3.28.0; generated Hey API0.99.0 fetch SDK + Zod4.6.5 validators; narrow bluemonday/x-net sanitation; managed Auth0 Angular/Go JWT adapters. No ORM, frontend state platform, Redis, message queue or additional application service.

**Storage**: PostgreSQL18 (local18.6); company/audit/inbox/versions/retry records in SQL; immutable private picture objects and SQL metadata. Staging separate from published objects; expired drafts inaccessible exactly24h, hourly bounded cleanup targets physical removal within25h.

**Testing**: Go compile/vet/race and focused service tests; real PostgreSQL integration; generated contract drift and malformed-response fixtures; Vitest frontend behavior; Playwright keyboard/Arabic/workflow; table-driven REST/MCP parity; measured load/startup/image/memory/recovery tests.

**Target Platform**: Modern desktop/tablet browsers >=768px; Firebase Hosting SPA, Linux second-generation Cloud Run, europe-west1 Cloud SQL Enterprise PostgreSQL18 and Standard Storage. Auth0 managed issuer with Google connection; no existing company Workspace/SSO is assumed.

**Project Type**: One company web application plus user-delegated remote MCP API; independent frontend/backend artifacts in one repository.

**Performance Goals**: SC-003 warm web p95<=2s, first project/board after 30 minutes idle p95<=5s; ordinary warm API engineering budgets reads<=500ms/writes<=750ms; SC-010 upload p95<=30s including 10 MiB; SC-013 durable notification availability p95<=5s and next read. These are acceptance targets, not achieved results.

**Constraints**: Current authorization at every read/write/download/count; strict validated typed boundaries; four typed stage categories with stable starting/custom identifiers, configurable column presentation and allowed moves; no permanent deletion; bounded default 25/max 100 portions plus1MiB ordinary JSON page cap; no dependence on Cloud Run local disk, instance identity or long-lived sessions. Daily backups/PITR, measurable restore and explicit recurring-cost reforecast.

**Scale/Scope**: 50 concurrent users;20 projects;10k issues including2k subtasks/up to2k per project;20k comments/up to500 per issue;3boards/project;1kdependencies;1kpictures averaging1MiB plusmax10MiB trials;10labels/project;dates on half the issues;50knotifications;>=20%Arabic/bilingual content. All63FR and14SC are covered below.

## Constitution Check

Pre-research gate passed for the chosen one-frontend/one-backend architecture. Post-design review passes all gates below; actual application checks are still required during implementation. No constitution amendment/exception is requested.

| Constitution gate | Pre-research result | Post-design evidence |
| --- | --- | --- |
| I: static typing, validated boundaries, generated REST/client and SQL | PASS; version/client unknowns assigned research | Go commands/results and strict TS/templates/forms; Huma OpenAPI -> immutable SDK+Zod; sqlc/pgx; typed config/identity/HTML/file boundaries; schemas in contracts |
| II: separate frontend/backend and compatible releases | PASS | Own manifests/builds/deploys; Angular HTTP-only; no DB/cloud secrets in browser; /v1 compatibility and backend-first rollout |
| III: simple feature organization and supported pinned dependencies | PASS; dependency research assigned | Feature-owned Angular UI/API adapters and Go services/SQL/REST/MCP adapters; shared platform only for concrete runtime concerns; one Go process and PostgreSQL; no speculative cache/queue; Auth0 solves required OAuth, Storage solves durable pictures, hourly Scheduler solves expiry while min 0 |
| IV: official SDK, same services/permissions/invariants/audits | PASS | Stateless SDK transport; same50 service commands/read operations; per-request DB permission; project transactions, caller-scoped retry ledger, current-state conflicts, audit/notification atomicity |
| V: performance, bounded queries/pools/scaling and recurring cost | PASS; capacity/cost research assigned | Full fixture and p95 budgets; keyset pages/indexes; capped render/transfers/DB pools; explicit min 0/max 2; gross32-46USD/month candidate and upgrade triggers |
| Hosting: replaceable instances, durable storage, narrow identity, backup/restore, local dev and IaC | PASS; storage/recovery research assigned | SQL/private objects; IAM connector; runtime/migration/maintenance separation; backup30/PITR7; measured RPO5min/RTO4h drills; local dev without paid cloud; versioned Terraform/Firebase config |

## Project Structure

### Documentation for this feature

```text
specs/001-gategoldjira-mvp/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── domain.schema.json
│   ├── operations.json
│   ├── rest-api.md
│   └── mcp.md
├── checklists/requirements.md
└── schema-proposal.sql       # pre-existing broader proposal; preserved, not applied
```

The generated [tasks.md](tasks.md) follows the feature-first source layout below and includes all ten required stories and full acceptance/hosting gates.

### Planned feature-first source code at repository root

```text
frontend/
├── package.json / package-lock.json / angular.json / tsconfig*.json
├── public/                   # public runtime config only
├── src/app/
│   ├── app.routes.ts         # compose lazy feature routes
│   ├── core/                 # singleton auth/config and HTTP interception
│   ├── api/generated/        # immutable OpenAPI SDK/types/validators
│   ├── shared/               # reusable UI/pagination/bidi utilities; no feature rules
│   └── features/
│       ├── projects/
│       ├── issues/
│       │   ├── pages/        # routed issue list/detail components
│       │   ├── components/   # issue-specific controls
│       │   ├── issues.api.ts # typed adapter around the generated client
│       │   └── issues.routes.ts
│       ├── boards/           # Kanban, drag/keyboard movement and WIP display
│       ├── comments/
│       │   ├── components/   # thread/editor and lazy Tiptap adapter
│       │   ├── comments.api.ts
│       │   └── comment-renderer.ts # typed safe HTML/direction adapter
│       ├── pictures/         # authenticated upload/gallery/rendering controls
│       ├── notifications/    # personal inbox and read-state UI
│       └── administration/   # company users/roles
└── e2e/
backend/
├── go.mod / go.sum / Dockerfile / sqlc.yaml
├── cmd/gategoldjira/          # server and explicit ops subcommands
├── internal/
│   ├── app/                  # construct services and register both transports
│   ├── features/
│   │   ├── identity/         # approved accounts, roles and memberships
│   │   ├── projects/
│   │   ├── issues/           # children/dates/labels/blockers/completion rules
│   │   │   ├── types.go      # concrete commands/results and domain values
│   │   │   ├── service.go    # authoritative permissions and business rules
│   │   │   ├── http.go       # typed Huma handlers -> the same service
│   │   │   ├── mcp.go        # typed SDK tools -> the same service
│   │   │   ├── queries.sql   # feature-owned sqlc query inputs
│   │   │   └── service_test.go
│   │   ├── boards/
│   │   ├── comments/         # safe HTML, authorship, versions and mentions
│   │   ├── pictures/         # draft/publication/access/expiry rules
│   │   ├── notifications/    # event recipients, dedupe and private inbox
│   │   └── activity/         # durable attributable history
│   └── platform/
│       ├── config/
│       ├── auth/             # JWT/OAuth boundary and typed caller context
│       ├── command/          # transactions, authorization locks and retry ledger
│       ├── database/
│       │   └── dbgen/        # immutable sqlc output
│       ├── objectstore/      # Cloud Storage and explicit local-dev adapter
│       ├── httpapi/          # common Huma setup/middleware/error mapping
│       └── mcpapi/           # common SDK/OAuth/transport setup
├── db/migrations/            # one ordered migration history for the shared database
└── tests/                    # cross-feature integration/parity/performance/recovery
infra/
├── terraform/                # Cloud Run/SQL/buckets/IAM/alerts/Scheduler
└── firebase/                 # SPA rewrites/headers/deployment config
identity/
└── auth0/                    # typed claims Action and declarative issuer/client config
scripts/                      # only concrete generation/validation/release needs
compose.dev.yaml
Makefile
```

**Structure Decision**: One repository contains two independently built/deployed applications. Features own their changes end to end within each application. A comments change normally touches `frontend/src/app/features/comments/` and `backend/internal/features/comments/`, plus a migration or regenerated contract when needed. Proposed source directories do not exist yet; this is the layout for task generation and implementation.

### Feature ownership and dependency rules

- **Angular**: Keep routed pages, feature components, API adapters and their behavior tests together under `features/<feature>/`. Only routed features need a routes file or pages directory. Add a local signal store only when a current screen needs shared state; simple screens can keep typed state in the component. Use generated wire types directly and add feature-local UI types only for actual presentation needs. Load the editor lazily and preserve the existing board render/pagination budgets.
- **Go**: Start with one package per feature and a few descriptive files, as illustrated by `issues/`. All files in that directory use the same feature package. Split large files by concrete action, such as `move.go`, `dependencies.go` or `mentions.go`, when the implementation needs it. Keep feature tests next to the code. Do not require separate domain/application/infrastructure layers or a repository interface for every feature.
- **REST and MCP**: Co-locate feature handlers/tools in `http.go` and `mcp.go`. Each adapter validates/maps typed boundary data and invokes the same concrete service command; permission, transaction and workflow behavior belongs to that service. Features receive the Huma/SDK registration objects from `internal/app/`; they do not start servers. Shared transport packages contain setup and protocol helpers, never independent business actions. This keeps all 50 operations and both transport contracts unchanged.
- **SQL**: Keep handwritten query inputs with the owning feature. `backend/sqlc.yaml` explicitly lists the feature query directories and any current platform command queries, with one generated output package at `internal/platform/database/dbgen/`. Query names must be globally unique and identify their feature/action. Services use generated functions with the current transaction and map database values to concrete domain types. Keep migrations central because foreign keys, prerequisite graph rules and atomic commands share one PostgreSQL database. Never edit generated SQL/client code.
- **Shared code**: Angular `core/` owns app-wide runtime concerns; `shared/` owns reusable presentation primitives. Go `platform/` owns configuration, authentication boundaries, transaction/retry primitives, connections, object-storage adapters and transport setup. Feature-specific validation, recipients, workflows and HTML policy stay in their features. Move code into shared folders only for an existing reuse or runtime boundary.
- **Dependencies and transactions**: `internal/app/` wires features and platform dependencies; platform packages never import feature packages. Feature services may call a small concrete collaborator for a current operation, but never another feature's HTTP/MCP handler. Keep the package graph acyclic: notification/history writers accept typed event facts and the existing transaction instead of importing issue/comment services, and picture operations do not import comment services. Cross-feature writes reuse the same caller, project locks and transaction; collaborators never start an independent nested transaction. Preserve the existing lock order, retry rules and atomic audit/notification guarantees. Do not add an event bus, generic repository framework or separate feature deployment.

### Example: saving a comment

The Angular comments editor calls `comments.api.ts`, which uses the generated REST client. In Go, either the comments HTTP handler or MCP tool calls the comments service. That service enforces current access/authorship, sanitizes the HTML, resolves selected mentions and coordinates the existing picture publication workflow. Its final short transaction saves the comment/version together with picture metadata, history, notifications and the retry result; object transfer remains outside database locks as defined below. Both transports use this same path. Picture controls can be reused through their explicit Angular feature exports without importing another feature's page.

## Phase 0 Research Decisions

Completed [research.md](research.md) records Decision/Rationale/Alternatives and current primary sources for supported versions, generated runtime validation, managed OAuth, stateless MCP/image limits, HTML/Arabic, transactional consistency and Google Cloud cost/recovery. Initial technical unknowns have concrete selections. Actual billing benefits/tenant entitlements and deployed URLs remain deployment checks, with deterministic configuration rules, not unresolved design choices.

The existing schema-proposal.sql includes configurable types/custom fields beyond the current spec's explicit scope. Preserve it as a separate proposal. This plan uses fixed Task/Bug/Subtask and does not silently expand the MVP.

## Phase 1 Architecture and Services

### Typed boundary and contract flow

Go domain/service commands -> typed Huma request/result DTOs -> generated OpenAPI -> generated TypeScript fetch SDK and Zod validators -> small Angular feature services -> typed forms/signals. SQL migrations/queries -> sqlc generated pgx types -> explicit domain mapping. MCP concrete input/output schemas -> same services. Dynamic editor/JSON/SDK attributes stay at validated adapters; no any/maps as domain models.

[Operations](contracts/operations.json) defines50 business actions and their wire shapes/permissions, including account administration, candidate lists, versions, images and own inbox. [REST](contracts/rest-api.md) defines transport/status/pagination rules; [MCP](contracts/mcp.md) defines OAuth, typed envelopes and binary limits. No separately hand-maintained runtime OpenAPI. Mutations use full replacement where fields are editable, explicit null for clear, positive decimal revisions and caller retry references.

### Identity and privacy

Auth0 manages PKCE login and OAuth discovery. Separate REST (/api) and MCP (/mcp) audiences share issuer/subject account binding; neither transport accepts the other's token. Approved company accounts exist before first binding; verified email claims only establish a one-time link. Subsequent access depends on current database state, not cached token roles. Initial owner bootstrap is an operations command, not a public endpoint.

Development addendum2026-10-12 (DEV-AUTH-001): the local sign-in form accepts a generated fixture username/password through the typed `POST /api/v1/auth/local-sign-in` endpoint. The development identity adapter compares bcrypt hashes from a private credentials file and issues a fresh signed one-hour REST access token only for an approved active fixture. The generated response contains `accessToken` and `expiresAt`; the Angular auth adapter validates the generated schema and keeps the token in memory. `dev-init`/`dev-tokens` create ignored private `credentials.json` (hashes and fixture identity) and `accounts.json` (generated usernames/passwords for the developer) beside the signing key if missing, preserving existing credentials. Passwords/tokens are not logged or included in browser storage. Login work is bounded; inactive accounts and failed credentials return clear safe errors. Only development configuration can register this endpoint, with production/Cloud Run guards. The50 business REST/MCP operations and production managed OAuth remain unchanged.

All accessible project queries/counts include current authorization. Last-Admin changes and eligibility cleanup are atomic. Global Admin sees every project but cannot edit another author's comment or inspect another inbox. Unknown/inaccessible IDs share the same unavailable outcome. No assistant-provided actor, arbitrary recipient override, direct notification tool or public picture URL.

### Transactions and workflow

[data-model.md](data-model.md) specifies company authorization guard, caller retry claim, sorted project write locks, entity/graph/order revisions, cycle CTEs and rank-gap rebalancing. Short transactions commit business records, prior versions, audits, notifications and retry results together. Replays return original data after current operation/resource permission checks. Same caller/reference/input has one effect across transports; changed input is rejected.

Issue Done requires all direct blockers and children Done; child reopen/create requires non-Done parent. Parent->child and dependent->blocker edges are checked as one prerequisite graph. Blocked is derived independently of status; reopening blockers never silently reopens completed dependents. WIP is soft, counts all saved-view matches, and never bypasses or strengthens these completion rules.

### Browser interaction

Lazy feature routes, signals/OnPush, typed forms, generated client parsing and stable-ID rendering keep the SPA simple. Board starts with25 cards per column (100 total); page incrementally and cap simultaneous rendered cards with windowed/load-more views, never fetch/render the whole2k-project dataset. Drag operations send only moved/neighbor IDs and revisions; keyboard controls provide equivalent status/order actions. Failed optimistic changes restore confirmed state and present current conflict/prerequisite information.

Issue details fetch discussion/gallery/child/dependency pages independently, with counts and explicit continuation. Editor and full pictures load lazily; opening the record never waits for every image. Safe HTML uses a typed rendering adapter with authenticated blob fetches and controlled paragraph direction/bidi handling, avoiding Angular unsafe bypasses. Preserve unsent editor text during the current session on upload/save failures; offline editing/persistent drafts are outside scope.

Inbox loads on opening and refreshes after relevant actions or explicit refresh. No WebSocket/live sync or email/push worker; the next authorized read observes committed state. Server supplies companyToday/derived overdue and full WIP counts.

### Durable picture pipeline

Use private staging and published Standard buckets in the same region. Upload streams/checks metadata/type/size/checksum with a resumable technical reservation; no project lock or DB connection is held during transfer. Confirm immutable object generation before the final short transaction; failed commits leave inaccessible orphans for maintenance. Uploader-only unexpired drafts publish on successful comment save; gallery uploads publish directly. Old versions retain picture IDs permanently.

REST downloads proxy current permission and no-store headers; MCP download returns one bounded base64 value with short text to prevent duplicate serialization. Gate two transfers per instance before large decoding/read. Object bytes never live only on Cloud Run disk or in comment HTML. No full bitmap decompression/thumbnail service is required merely to store images. Exact24h draft denial is a SQL rule; hourly service-authenticated cleanup handles physical storage.

### Notifications and history

Create one event identity per logical saved command, with attributable audit records for every affected resource. Compute recipient/reason union for each affected issue from the exact spec table, exclude actor, check current eligibility, and enforce unique event+issue+recipient in the same commit. Comment edits notify new mentions only; dependency/last-child transitions notify affected dependent/parent, not a duplicate role entry. No notification from failed/no-op/read-state operations.

Retain safe typed audit values/versions for installation life. Notification reads/counts/read-state are recipient-only under current project access; personal audits expose metadata/read-state changes without message body. Mark-all affects accessible current snapshot only. Nothing asynchronous delays a saved notification beyond the next read.

## Google Cloud Operating Plan

| Setting | Initial selection |
| --- | --- |
| Region | europe-west1 for Go, SQL, pictures and registry; verify actual Cairo RTT |
| Frontend | Firebase Hosting static Angular build, SPA route rewrites, security/cache headers; public config only |
| Backend | Cloud Run second generation, request billing,1 vCPU/1GiB, concurrency40, min 0/max 2, startup CPU boost |
| Requests | Platform60s; ordinary application5s; pictures30s; ReadHeader5s and bounded body/read/write deadlines |
| Database | Explicit Enterprise, PostgreSQL18, db-g1-small/1.7GiB shared CPU, single zone;10GiBSSD, auto-grow with initial50GiB limit |
| Connectivity | Go connector1.25.3/lazy refresh/IAM DB auth; encrypted public-IP connector route, SQL authorized networks empty; no VPC connector |
| Pool / overload | pgx max10/min 0 per instance, idle5min; acquire context deadline; DB role cap40 only after capacity check; separate admin headroom |
| Secrets / identities | Workload identity/ADC; runtime least-privilege SQL/object permissions; migration identity separate; maintenance scheduler/endpoint dedicated service identity; secrets via Secret Manager version injection |
| Expiry | Hourly Scheduler -> same backend maintenance endpoint; Google-issued service token checked against exact audience and allowlisted identity; no business-record response |
| Recovery | Daily backups retain30, PITR logs7days, retained/final30day backup, deletion protection; published-bucket soft delete30days |
| Observability | Structured metadata-only logs, latency/error/pool/lock/CPU/memory/storage/transfer alerts, gross-cost budget alerts; no tokens/comment/image payload logging |

Runtime public Cloud Run transport is necessary for browser/MCP access; application JWT authorization protects company endpoints. Public health/OAuth metadata and separately service-authenticated maintenance routes are explicitly identified exceptions. Storage publish/cleanup permissions are divided so ordinary runtime cannot delete committed pictures. No separate always-on application or worker.

At stated traffic/storage assumptions, the min 0 shared-SQL candidate is approximately32-46USD/month before promotional credit; min 1 variant45-60; dedicated single-zone SQL56-70. Full calculations and sources are in research.md. Costs vary by actual regional SKUs/free-tier sharing/retention/traffic. Confirm the user's200USD Cloud credit scope, remaining balance and expiry before use; no cloud account was accessed.

The shared/single-zone SQL candidate has no availability SLA. It must pass the full 50-user test before company launch; use dedicated capacity if needed. HA is a separately costed availability upgrade if required. Proposed measured RPO<=5min/RTO<=4h, before-launch and quarterly restore drills; no guaranteed regional disaster recovery is claimed.

## Delivery Slices for Task Generation

1. Establish pinned manifests/local environment, typed configuration, generated OpenAPI/SQL/client fixture, transaction/retry/audit foundation, transport registration and CI checks.
2. Identity/approved-user binding, initial Admin operations bootstrap, current role/last-Admin/assignment cleanup, projects/memberships/archive and basic web navigation.
3. Issue search/assignment, calendar dates/labels, one-level child model and completion guard, full filters and bounded query helpers; add event/notification hooks with domain changes.
4. Boards/saved filters, shared ranks/keyboard/CDK movement, Review and saved-view WIP counts/configuration; graph/parent/order conflicts exposed consistently.
5. Explicit blocked-by graph operations, combined-cycle/race checks and affected dependent/parent notifications; no stage is a released MVP before all completion guards are integrated.
6. Safe versioned comments, pictures/storage pipeline, Arabic/direction, selected mentions and full inbox; same service actions exposed in web and MCP as each feature lands.
7. Complete all 50 transport contracts, managed OAuth/reference and assistant-client compatibility, parity/role/retention/retry/keyboard/Arabic acceptance.
8. Exact-workload warm/idle/image/memory tests, cost reforecast and SQL/min-instance decisions, IaC/release and restore drill, then full MVP readiness report.

This is sequencing input, not generated tasks.md. Each implementation slice carries appropriate behavior/DB/parity coverage; static declarations alone do not satisfy it.

## Requirement Traceability

| Requirement IDs | Design / validation coverage |
| --- | --- |
| FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 | Managed identity + users/memberships; per-action permission, eligibility cleanup and last-Admin transaction; identity/project parity fixtures |
| FR-007, FR-008, FR-009 | Project schemas/services, immutable key/default board and archive/restore; project lifecycle scenarios |
| FR-010, FR-011, FR-012, FR-013, FR-014 | Issue commands/results, counter/reporter/assignment, typed filters/indexes/My Issues; issue and authorized search scenarios |
| FR-015, FR-016, FR-017, FR-018 | Board/card contracts, shared rank/order versions, full counts, drag+keyboard; filtered/restart/conflict ordering scenarios |
| FR-019, FR-020, FR-021 | HTML allowlist, author-only comment versions and stable oldest-first pages; safe formatting/history tests |
| FR-022, FR-023, FR-024, FR-025, FR-026, FR-027 | All50 schemas/page helpers; validation/outcomes, entity/graph/order revisions, caller retry ledger, durable SQL/object/audit; pagination/retry/stale/restart scenarios |
| FR-028, FR-029 | All frontend feature routes/forms/controls, focus/labels/errors and >=768px keyboard acceptance |
| FR-030, FR-031, FR-032, FR-033, FR-034 | Same50 MCP actions, authenticated actor, shared services/outcomes, next-read consistency; OAuth and parity/assistant workflows |
| FR-035, FR-036 | Plain project/issue text, narrow safe HTML, retained business/history/pictures; rendering/archive/version tests |
| FR-037, FR-038 | Named saved boards, creator/current-role/default restrictions and archival; board ownership tests |
| FR-039, FR-040, FR-041, FR-042 | Canonical formatted comments, multipart/base64 transfer, protected durable pictures and Arabic direction; upload/type/revocation/round-trip trials |
| FR-043, FR-044, FR-045, FR-046, FR-047 | Directed graph/derived blocked/completion/cycles/reopen, exact draft privacy/expiry; graph races and expired/failing upload scenarios |
| FR-048, FR-049, FR-050, FR-051 | Calendar DATE/companyToday, casefold label reuse, inclusive/AND filters; midnight/null/range/case scenarios |
| FR-052, FR-053, FR-054 | Review enum/rank/columns, owner/Admin WIP configuration, full saved-view soft warnings; equal/exceeded/temporary-filter tests |
| FR-055, FR-056, FR-057, FR-058 | Child issue model/immutable parent/progress, combined prerequisite guards/project lock; completion/create/reopen concurrency tests |
| FR-059, FR-060, FR-061, FR-062, FR-063 | Validated mentions, event-recipient rule engine and dedupe, private authorized inbox/count/read-state, durable next-read availability; all notification scenarios |

| Success criteria | Evidence required for acceptance |
| --- | --- |
| SC-001 | >=10 users, >=90% finish core web flow within 5 minutes |
| SC-002 | Full role matrix through both transports, zero unauthorized changes/disclosure |
| SC-003 | >=100 trials/action, warm<=2s and idle-start<=5s p95 under full fixture |
| SC-004 | >=20 complete assistant sessions including all collaboration features and next-web-read agreement |
| SC-005 | Every mutation same-reference24h replay exactly once, stale prevention and restart durability |
| SC-006 | Every unchanged collection/filter traversal once, bounded initial loads |
| SC-007 | Core keyboard flows at desktop/tablet>=768px, text feedback/labels/focus |
| SC-008 | Board isolation/shared order and dependency/parent/cycle guards |
| SC-009 | >=30 Arabic/bilingual examples, safe HTML and no unauthorized picture disclosure |
| SC-010 | >=100 picture upload trials including 10 MiB, p95<=30s, failure draft preservation |
| SC-011 | Dates/labels across midnight/null/combined filters/case reuse |
| SC-012 | Child relationship/progress/parent guards and concurrent races |
| SC-013 | >=100 notification events, exact eligible once/non-actor delivery, privacy/read parity, p95<=5s next-read availability |
| SC-014 | Review persistence, full WIP/equal/exceeded counts, soft limits and configuration/keyboard parity |

Run commands, prerequisites and expected outcomes are in [quickstart.md](quickstart.md). None of these application acceptance checks has run during planning.

## Risks, Resolution Gates and Rollout

| Risk | Resolution / required evidence |
| --- | --- |
| Dependency pins not compiled together | First implementation gate installs exact lockfiles, compiles Go/Angular, generates nullable/date/enum/Unicode fixture and runtime parsers; record any justified pin adjustment. Configure generated length checks and typed form counters to match the server's Unicode-character and separate UTF-8 byte limits; do not edit generated files |
| Auth0 tenant/free-plan/workforce/client limits | Verify actual tenant entitlements and registered assistant OAuth/payload flow before release; reforecast any paid tier; no custom auth server fallback silently |
| Starter SQL or coarse project lock too slow | Real full-fixture p95/lock/pool/memory measures; tune queries; upgrade SQL; refine locks only with preserved race coverage |
| Cold startup beyond5s | Optimize binary/startup/connector, measure min 0 and min 1, update monthly budget before selecting min 1 |
| Immediate image/inbox revocation | Every new request reads current permissions; deny copied unauthenticated URL; no public/signed reads or caches |
| Object and SQL commits are separate | Confirm immutable generation before commit; inaccessible orphan cleanup; retry/reservation/race/restore tests; no incomplete references |
| Retention/cost grows beyond initial allowance | Monitor SQL/bucket/backup/egress growth; capacity/cost reforecast at50GiB threshold and as lifetime history grows; no automatic history deletion |
| Single-zone loss / restore uncertainty | Verified backup/PITR/object recovery drill before company use and quarterly; measure proposed RPO/RTO; HA if availability needs demand it |

Release sequence is backup/readiness -> additive migration with migration identity -> compatible backend canary/smoke -> frontend publish. Application rollback uses prior Go image/Firebase release; preserve additive schema and company data, never destructive down migration as routine rollback. Breaking contract changes require explicit compatibility/version and data migration plan. Cloud provisioning/publishing are later implementation/deployment work.

## Complexity Tracking

No constitution violations or exceptions. Auth0 is required managed OAuth, private Storage is required durable images, and hourly Scheduler is required bounded expiry cleanup when the service scales to zero. Their configuration/cost are included; no extra GateGoldJira service, queue, cache or worker is introduced.

## Planning Validation

Delivered research, data model, runbook and four contract files, followed by the feature-first task list. Planning checks passed: JSON syntax and structural bounds, 85 schema definitions with 526 local references resolved, 50 unique operation/tool/routes, all 26 mutation retry declarations, required path arguments, both typed MCP result branches, local document links/code fences, and complete 63 FR/14 SC traceability. Spec Kit prerequisites discover all design artifacts; integration integrity reports zero missing/modified managed files. No extension hooks are installed. Application compilation/tests, cloud billing eligibility, performance, identity tenant configuration and restore measurements remain explicitly unexecuted until implementation.



## Jira-style UX implementation addendum

Use the existing Angular feature pages and CDK drag/drop; add a small typed SVG icon component and shared CSS design tokens. Build a responsive app shell, feature-local styles, compact issue/card metadata and progressively disclosed advanced controls. Route all actions through existing generated clients and services; keep business rules on Go. Preserve explicit keyboard movement and current retry/revision behavior. Use small native dialog/panel patterns where helpful, with semantic labels and focus handling. No schema or hosting changes are planned.

Constitution check: strict typed inputs/domain models and generated API remain authoritative; frontend/backend deployables remain separate; REST/MCP behavior is unchanged; no new UI dependencies/services are justified; bounded board rendering and latency budgets remain applicable. Validate with current unit/contract checks and isolated browser acceptance plus screenshots of desktop and mobile/tablet results.

## Issue workspace and document attachments implementation addendum

Extend the native issue title link over the board card and issue-list row, keeping parent links and movement controls above that surface. During a CDK drag disable issue navigation until pointer release and drop completion. Promote comments and attachments on the existing detail route and use typed component methods to focus the actual editors/file inputs.

Add separate feature-first `attachments` packages in Go and Angular. Keep inline images on the existing validated picture service. Store document metadata in an additive PostgreSQL migration with sqlc-generated queries and document bytes through the existing private object-storage platform. Bound lists with stable cursor pagination. Accept PDF, UTF-8 TXT/CSV and DOCX/XLSX with server-side signature/container validation, safe filenames and10MiB maximum; return authenticated attachment downloads with `Content-Disposition: attachment`, `nosniff` and private/no-store. Retain committed bytes on detach. Reuse actor permissions, project serialization, issue revisions, audit and idempotent retry machinery. Typed Huma models generate the OpenAPI and strict TypeScript/Zod client; typed MCP operations call the same service.

Constitution check: both applications stay separate and statically typed; REST/MCP and generated SQL/API boundaries remain authoritative; no new dependency, service, cache or infrastructure is planned. Reuse storage and include retained document bytes/egress in the existing storage budget and50GiB reforecast threshold. Existing upload size, pagination, request timeout and workload budgets still apply. Run meaningful service/real-PostgreSQL/transport tests, regeneration checks, strict frontend templates/tests, production build and browser issue/comment/image/document workflow. Apply the additive migration before the compatible backend, then frontend; rollback applications while preserving schema and retained files.


## Rich text and board editor implementation (2026-10-13)

Implement HTML-001/HTML-002 and FLOW-001–FLOW-003 through the existing issue/comment and board features. Reuse lazy Tiptap for visual/source editing; serialize allowed typed frontend nodes, with authoritative issue-description HTML normalization in Go. Add optional typed descriptionFormat inputs/views and a PostgreSQL plain/html discriminator so legacy plaintext is never inferred to be HTML. Use private published same-issue pictures in descriptions and the existing draft publication for comments; never interpret external image URLs as attachments.

Add a bounded typed BoardWorkflow (four WorkflowColumn entries with stable Status, name and allowedTargets) to board summaries and optional board updates. Store workflow JSONB in the additive migration00005 alongside the description-format discriminator. Go validates complete/unique stages and names, canonical target order, and reachability of Done. Missing update fields preserve configuration; optional output fields tolerate older saved retry payloads. Board reads order the four already-counted columns using configuration, adding no per-card database work. Issue commands call the existing board collaborator for transition rules under the project mutation lock; absent source-board moves use the default configuration.

The Angular board-settings route adds a column/flow editor with drag handles, keyboard order controls, a workflow preview, transition checkboxes and the existing settings save/review flow. Kanban titles, move menus and CDK drop predicates use the saved workflow; the server remains authoritative. Existing per-status WIP limits and shared issue ranking are unchanged. No dependencies, new services, cloud resources or arbitrary dynamic status machinery are needed.

Constitution check: separate strict Angular and Go applications, typed/generated SQL and API boundaries, shared REST/MCP services, current authorization, revision/retry/audit semantics, durable PostgreSQL configuration and existing query/page/memory limits are retained. No recurring hosting cost change is expected for the bounded metadata fields. Verify real PostgreSQL transitions and format/retry safety, strict templates/unit/browser typing, browser editor/drag/Arabic/conflict flows, generated drift, architecture, Go vet and production builds. Roll out additive migration before backend, then frontend; application rollback preserves schema/data.


### Confirmed dynamic workflow and rich editing design (2026-10-13)

The four original status strings remain the starting stages. Custom stage identifiers encode a typed category plus a canonical UUID (`review:<uuid>`, for example); Go's Status value, generated OpenAPI/MCP patterns and frontend Zod schemas validate them. Category logic replaces exact `done` comparisons in completion, hierarchy, dependencies, overdue and filters. project_status_order registers stage identities/names and keeps independent rank revisions. BoardWorkflow columns and allowed destinations have no fixed count; graph validation uses an iterative reverse traversal. Board saves register new project stages and extend other boards atomically under the existing project lock, advancing affected board revisions and respecting their category routes. New boards inherit the default workflow. Cards remain paginated and preserve the 100-card per-column browser window. Migration00005 is additive; it retains legacy status values, defaults description_format to plain, and adds workflow metadata and generic download MIME support. Custom issue stages must be registered in their project.

Descriptions and comments use the existing lazy Tiptap runtime, visual/source editing and the inert typed HTML renderer. Private inline description pictures reuse the authenticated picture pipeline and require published same-issue IDs. Gallery upload returns an optional committed issueRevision; the editor advances its base only by its own expected single increment, preserving concurrent-edit conflicts and drafts. Comment pictures retain their draft publication lifecycle. Clipboard/drop upload reuses the existing retry-preserving upload control; pending transfers block submission. A new issue is saved before description pictures are uploaded. Generic files use application/octet-stream, private download disposition and the existing 10MiB object pipeline; known document formats retain their validation. No extra transport operation is added:55 business operations and28 mutations continue to share services.

The confirmed FLOW-004/HTML-003/ATT-004 scope supersedes earlier four-stage-only or document-only implementation notes in this plan.


## Daily workflow completion plan (2026-10-13)

Keep the existing Angular/Go/PostgreSQL feature ownership and generated contracts. Extend
board workflow columns with per-stage limits and explicit retirement mappings; synchronize
project transitions transactionally. Use the current project write lock and issue movement
guards for stage migration. Preserve retired stage identities and audit events. Until a shared
workflow save, enforce every active board's existing restrictions rather than silently relaxing
a configured rule. Add additive database fields/tables for issue archive/backlog state, retained
links, watchers and private saved searches. Reuse existing service commands for inline/bulk
actions and cloning; add typed REST/MCP operations only where a new business capability needs
one. Reader-scoped history must use current issue access and a closed safe field projection.

Use a routed/shared issue workspace in a native dialog for board previews, a session-only
draft service, bounded sequential file queues and foreground polling (30 seconds, no overlap,
pause when hidden/busy). Do not add infrastructure or dependencies. Lists remain paginated;
bulk actions capped at 100 selected issues with individual outcomes. Persist user-owned saved
search definitions server-side with validated IssueFilter values. Keep the 1 MiB response and
100-card column windows. Read/write latency budgets remain 500/750 ms warm and web p95 2 s;
measure affected local operations and keep cloud acceptance explicitly pending.

Constitution check: typed models/validated boundaries and generated SDK/sqlc; separate builds;
no new service or paid infrastructure; shared REST/MCP authorization, retries, audit and guards;
bounded lists, uploads and polling. Backend-first additive migration and deployment, followed
by the regenerated frontend. Never down-migrate retained user records to roll back UI changes.

## Jira-style UI refinement (2026-10-13)

Reuse the existing Angular shell, native disclosure/dialog elements, typed SVG icon component,
CDK drag/drop and feature-first pages. Keep sidebar visibility and activity-tab selection in
component signals. Keep the comment editor mounted while its panel is hidden so tab changes
cannot lose rich content, files or pending edits. Isolate the issue template and action styles
from their controllers for easier maintenance. No package, database, API or hosting changes.
Validate with an isolated PostgreSQL/browser fixture, current-run screenshots at1440/768/390px,
keyboard navigation, preserved drafts, complete browser regressions and strict builds.

## Direct issue editing and unified attachments (2026-10-13)

Introduce feature-owned `IssueFieldEditorComponent` with a typed field union, generated boundary
validation and existing session draft/retry services. Keep a base issue snapshot for each edit;
explicit conflict review merges only the selected field onto fresh server values. Keep the full
issue form for editing several fields at once. Render comment edits in their original record.

Replace the unused split gallery/list/upload components with `IssueAttachmentsComponent`,
`FileQueueComponent`, the protected lazy picture renderer and a shared image/PDF/download preview.
Compose picture/document metadata into a discriminated union, request bounded pages from the
existing APIs and preserve authentication, object URL cleanup and stable upload references. Rich
editors use the shared queue; description upload revisions are observed sequentially to avoid
self-conflicts when uploading several documents.

Set `in_gallery` on first draft-picture publication inside the existing comment transaction and
advance its issue revision once. Existing published pictures bypass this change, preserving
explicit detach decisions. Regenerate sqlc and verify REST/MCP behavior; no schema, package,
hosting or API shape changes are needed. Update only the existing local API binary after tests.

## Product audit implementation plan (2026-10-13)

Implement AUDIT-IMP-001–011 in the existing Angular/Go/PostgreSQL applications. Add feature-owned
`planning/` packages for epics, releases and transition-based reports, and `integrations/` for
development references and small assignment rules. Extend notifications with preferences and
a PostgreSQL outbox; use the existing maintenance/operations boundary for delivery and reminders.
No broker, cache, microservice or paid local dependency is required.

Use additive migrations for planning, preferences/outbox, independent backlog rank/order,
CSV import identity and development references/rules. Services call sqlc queries, command
transactions, current permissions, revision checks and the shared audit writer. Register every
operation in REST and MCP and regenerate OpenAPI, SDK, validators and sqlc outputs centrally.
Old clients retain their current defaults. Backlog creation becomes an optional create field.

CSV preview validates a maximum100 mapped rows per batch. Import records stable source identities
and bounded per-row outcomes; confirmation uses stable retry references. Export uses paginated
authorized search and formula-safe cells. Planning and report queries use indexed project/time
scope and bounded pages/date ranges. Metrics define reopening and completion categories explicitly.

The UI keeps feature-local components and lazy routes. Searchable pickers share a typed UI
primitive while feature adapters retain permission/selection rules. A dedicated Backlog surface
keeps planning rank separate from status-column rank. Compact creation and stage editing preserve
existing drafts, keyboard behavior and conflict recovery. Discussion appears earlier on mobile.

Constitution check: strict typed forms/Go DTOs and generated clients/SQL; separate artifacts;
one Go process/PostgreSQL with no new infrastructure; REST/MCP shared services and audit/retry;
bounded100-row imports,100-item pages and reporting windows. Ordinary read/write latency targets
remain500/750ms and local web warm p95<=2s; local results never claim cloud acceptance. Delivery
uses a configured sender with credentials held only by the backend and remains disabled by default.

Verify new invariants on real disposable PostgreSQL, focused browser regressions first, then full
race/vet, strict Angular/templates/tests, generated drift, production build and affected performance
checks. Apply only additive migrations locally after validation, retain company records and existing
credentials, and record rollout/rollback limits. External tasks T135/T137/T139/T143–T147 remain open
until their actual accounts, employees or authorized cloud target provide the required evidence.

## Daily editing and board controls follow-up (2026-10-13)

Keep the feature-first Angular/Go/PostgreSQL architecture and existing infrastructure.
Planning uses typed independent-revision assignments and the current shared REST/MCP
service. Extend the session DraftsService with an immutable planning intent containing
the changed field, selected names, exact mutation body and retry reference. Lock controls
synchronously, guard reads/writes by issue generation and session, and require explicit
GET/rebase/apply for conflicts. Existing navigation and drawer draft protection remains
the authority for leaving unsaved work.

Board teammate selection reuses the authorized paginated project-assignee API. Named
quick filters reuse private project SavedSearch resources. Swimlanes are a presentation
of existing bounded column windows, retaining shared ranking and full saved-view counts;
grouping does not create separate per-lane windows or implicitly reassign issues. Add
optional typed epic metadata to CardPage using one authorized same-project query for
the returned card IDs, with no per-card requests or schema migration.

Rich descriptions/comments share Tiptap code-block, table and task-list extensions pinned
to the existing version. Both server sanitizers accept the same restricted structures;
the typed renderer/source conversion preserve completion and safe table spans. Keep
interactive editor controls out of sanitized history. Existing private-file references,
Arabic, explicit text saves, authorization, revision/retry and retained versions continue
through the same services. Load editor code lazily and retain production bundle budgets.

Verify exact retry bodies, conflict preservation, route/session races, viewer restrictions,
grouped drag/keyboard ordering, teammate pagination, personal filter privacy, safe rich
HTML and version rendering in unit/real PostgreSQL/isolated browser tests. Run final strict
types, generation drift, architecture checks, build and backend race/vet checks. Restart
only the preserved local API with the verified binary; no new migration or data reseed.
