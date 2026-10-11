<!--
Sync Impact Report
Version change: unratified scaffold -> 1.0.0 (initial adoption)
Modified principles:
- PRINCIPLE_1_NAME -> I. Static Types and Validated Boundaries
- PRINCIPLE_2_NAME -> II. Separate Frontend and Backend
- PRINCIPLE_3_NAME -> III. Simple Architecture and Readable Code
- PRINCIPLE_4_NAME -> IV. Shared Business Rules for REST and MCP
- PRINCIPLE_5_NAME -> V. Measured Performance and Controlled Cost
Added sections: Technology and Hosting Constraints; Development Workflow and Quality Gates;
  concrete governance and project purpose.
Removed sections: none; illustrative scaffold comments were replaced with project rules.
Dependent templates: reviewed; unchanged. Commands resolve this constitution at runtime.
Follow-up TODOs: none.
-->

# GateGoldJira Constitution

GateGoldJira is a company issue and project tracking application with an Angular browser
frontend and a Go backend accessible through REST and MCP. Its engineering priorities are
static typing, responsive user workflows, straightforward maintenance, and affordable
Google Cloud hosting.

## Core Principles

### I. Static Types and Validated Boundaries

- Application logic MUST use TypeScript with strict checking on the frontend and Go on
  the backend. Angular MUST enable `strictTemplates` and use typed forms.
- Project-owned code MUST use explicit domain models and typed request and response
  structures. TypeScript `any`, unchecked assertions, and Go `any` or untyped maps MUST
  NOT substitute for domain types. Dynamic data MUST be isolated at a boundary and
  validated before entering application logic.
- HTTP and MCP inputs, external responses, and environment configuration MUST be
  validated at runtime. Static types do not validate JSON or guarantee valid business data.
- The REST contract MUST be generated as OpenAPI from typed backend models. The frontend
  MUST use a generated TypeScript client; generated files MUST NOT be edited manually.
- Database access MUST use sqlc-generated Go query functions with pgx. Schema migrations,
  constraints, and generated query types MUST stay aligned. Persisted identifiers,
  nullability, and enum values MUST have consistent meanings across all boundaries.

Rationale: compiler checks catch mistakes early; boundary validation closes the gaps that
compilers cannot check across processes and stored data.

### II. Separate Frontend and Backend

- Angular and Go MUST be separate applications, organized under `frontend/` and
  `backend/`. A single repository is permitted; each application MUST have its own build,
  dependency configuration, and deployable artifact.
- The frontend MUST communicate with the backend through documented HTTP contracts.
  It MUST NOT access PostgreSQL directly or receive database credentials or server secrets.
- Backend services MUST be authoritative for permissions and business rules. Frontend
  validation MAY improve usability, but MUST NOT replace server enforcement.
- Backward-compatible backend changes MUST allow the currently deployed frontend to
  keep working. Breaking contracts MUST include a documented compatibility and rollout plan.

Rationale: independent applications keep deployment, ownership, and security boundaries clear.

### III. Simple Architecture and Readable Code

- The initial architecture MUST contain one Angular frontend, one Go backend organized
  by feature, and one PostgreSQL database. REST and MCP MUST run in the same backend
  application and deployment unless a documented requirement justifies separation.
- Code MUST use descriptive names, explicit control flow, small cohesive functions, and
  feature packages. Interfaces and abstractions MUST serve a current boundary or testing
  need rather than anticipated future flexibility.
- New infrastructure, caches, queues, search services, microservices, or orchestration
  platforms MUST identify a current requirement or measured bottleneck, their operating
  cost, and why the existing stack cannot meet that need simply.
- Dependencies MUST solve a concrete problem. Versions MUST be pinned through the
  appropriate manifests and lockfiles, and supported versions MUST be selected during planning.

Rationale: a company tracking application benefits from predictable behavior and low
maintenance overhead more than speculative infrastructure.

### IV. Shared Business Rules for REST and MCP

- REST handlers and MCP tools MUST call the same feature services for business operations.
  Neither transport MAY implement a separate permission model, workflow, or persistence path.
- MCP MUST use the official Go SDK and a remote HTTP transport supported by Cloud Run.
  Tool inputs and outputs MUST use concrete Go types and published schemas.
- Every user-facing REST endpoint and MCP tool MUST authenticate the caller and enforce
  the same operation and resource permissions. Public health or authentication endpoints
  MUST be explicitly identified and MUST NOT expose company data.
- Mutations MUST preserve database invariants through appropriate transactions. Concurrent
  updates and retries MUST have defined behavior; operations vulnerable to duplication
  MUST include an idempotency strategy.
- Successful mutations MUST record the actor, action, affected resource, and time through
  a shared audit mechanism. Logs and tool results MUST exclude credentials and secrets.

Rationale: AI access must preserve the same company rules and data integrity as browser access.

### V. Measured Performance and Controlled Cost

- Plans for data-heavy or latency-sensitive features MUST define measurable budgets for
  API latency, browser responsiveness, and workload size. Measurements MUST state the
  dataset, concurrency, region, and whether requests hit warm or newly started instances.
- List, search, and board endpoints MUST bound result sizes and support pagination or
  incremental loading. Queries MUST use appropriate indexes, avoid repeated per-record
  queries, and fetch only required data. Large board views MUST limit rendering work.
- Backend requests MUST propagate cancellation, enforce timeouts, and use bounded
  database connection pools compatible with the database capacity and Cloud Run scaling limits.
- Cloud Run minimum and maximum instances MUST be selected explicitly. Plans MUST account
  for the latency and cost tradeoff of scaling to zero and for database connection pressure.
- Hosting plans MUST estimate recurring compute, database, storage, networking, and backup
  costs before promotional credits. Credits MUST be treated as temporary funding, with
  their scope and expiry checked before relying on them.

Rationale: performance claims and hosting decisions must be based on the application's
workload and ongoing cost, rather than language benchmarks or temporary credits.

## Technology and Hosting Constraints

| Concern | Required baseline |
| --- | --- |
| Frontend | Angular browser SPA with strict TypeScript, strict templates, and typed forms |
| HTTP API | Go using `net/http` with Huma for typed contracts, validation, and OpenAPI |
| Database | PostgreSQL with versioned SQL migrations, sqlc-generated queries, and pgx |
| Frontend client | TypeScript client generated from the backend OpenAPI contract |
| MCP | Official Go MCP SDK calling the same services as the REST API |
| Frontend hosting | Firebase Hosting for the static Angular build |
| Backend hosting | Cloud Run for the Go API and remote MCP endpoint |
| Database hosting | Cloud SQL for PostgreSQL in the same region as the backend |
| Secrets | Secret Manager or equivalent Google Cloud secret injection into the backend |

- Durable application data MUST be stored in PostgreSQL or appropriate durable storage,
  never only in Cloud Run instance memory or the local filesystem. Instances MUST remain
  replaceable, and requests MUST NOT depend on reaching a particular instance.
- Backend services MUST use narrowly scoped service identities. Database connectivity
  MUST use authenticated, encrypted connections restricted to authorized services.
- A production plan MUST define database backup retention, recovery objectives, and a
  restore verification procedure before company data is entrusted to the deployment.
- Local development MUST run the frontend and backend separately against local PostgreSQL,
  without requiring production credentials or a paid cloud deployment.
- Infrastructure and deploy configuration MUST be version-controlled and reproducible.
  A hosting change MUST preserve the separate application boundaries and document its
  effect on performance, data migration, recovery, and recurring cost.

## Development Workflow and Quality Gates

1. Work MUST begin with a feature specification defining user outcomes, scope, acceptance
   scenarios, and relevant edge cases. The implementation plan MUST then define contracts,
   data changes, hosting implications, and a Constitution Check before tasks are generated.
2. The Constitution Check MUST address static typing and validation, frontend/backend
   separation, REST/MCP rule consistency, justified complexity, and applicable performance
   and cost budgets. Risks and exceptions MUST have concrete resolution or review criteria.
3. Changes MUST be verified with frontend type and template checking, a production frontend
   build, Go compilation and static checks, and regeneration checks for affected API or SQL
   contracts. Generated output MUST be reproducible and free of unexplained drift.
4. Tests MUST target behavior and risk. Permissions, workflow transitions, transactions,
   retry/concurrency behavior, and REST/MCP consistency MUST have relevant automated coverage
   when introduced or changed. Database changes MUST be checked against real PostgreSQL.
   Pure documentation or cosmetic edits need only the checks relevant to that change.
5. Data-heavy or latency-sensitive changes MUST include measurements against their declared
   budgets. A missed budget MUST be corrected or documented as an explicit, reviewed exception.
6. Delivery MUST record what changed, verification results, migration and rollback needs,
   and material limitations. Implementation MUST remain within the specified feature scope.

## Governance

This constitution is the source of project engineering rules. Feature specifications,
implementation plans, tasks, and reviews MUST comply with it. Templates are starting points;
their illustrative instructions do not override the adopted project principles.

Amendments MUST state the reason, affected principles, compatibility implications, and any
required migration. The project owner MUST review changes to mandatory rules. An explicit
project-owner instruction authorizing such a change satisfies that review requirement.
Routine implementation decisions that already comply with this constitution require no
additional approval.

Every substantive review MUST check compliance with the applicable principles. A temporary
exception MUST identify its reason, scope, owner, and removal condition in the feature plan;
it MUST NOT silently redefine a principle.

Version changes MUST follow semantic versioning: MAJOR for incompatible changes or removal
of mandatory principles; MINOR for new principles or materially expanded requirements;
PATCH for clarifications that leave obligations unchanged. Amendments MUST update the Sync
Impact Report and Last Amended date, preserving the original Ratified date. Initial adoption
of the scaffold is version 1.0.0.

**Version**: 1.0.0 | **Ratified**: 2026-10-11 | **Last Amended**: 2026-10-11
