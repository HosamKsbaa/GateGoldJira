# Shared API, authorization and transport rules

Cross-feature service and transport invariants. These are separately identifiable contract/operational cases, not a claim that one generic test proves every endpoint.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `transaction`: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153)
- `retry`: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1)
- `pagination`: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17)
- `errors`: [backend/internal/platform/httpapi/errors.go:1](../../../backend/internal/platform/httpapi/errors.go#L1)
- `server`: [backend/internal/platform/httpapi/server.go:95](../../../backend/internal/platform/httpapi/server.go#L95)
- `maintenance`: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36)
- `config`: [backend/internal/platform/config/config.go:2](../../../backend/internal/platform/config/config.go#L2)

## Cases

<a id="uc-sys-0001"></a>
### UC-SYS-0001 — Reject anonymous protected read

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Read a protected business endpoint without usable authentication.

**Expected results**

- A protected failure is returned without business data.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0002"></a>
### UC-SYS-0002 — Reject inactive account

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Invoke a business operation after its approved account is disabled.

**Expected results**

- Current account eligibility is enforced before authorized business work.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0003"></a>
### UC-SYS-0003 — Reject removed project membership

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Read a project-scoped operation after membership removal.

**Expected results**

- Project content is unavailable under current membership.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0004"></a>
### UC-SYS-0004 — Viewer write denied

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Forge a mutation request as a viewer.

**Expected results**

- The shared service rejects the write even if browser controls are bypassed.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0005"></a>
### UC-SYS-0005 — Member configuration denied

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Forge a project-configuration mutation as an ordinary member.

**Expected results**

- Configure permission is required independently of ordinary write permission.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0006"></a>
### UC-SYS-0006 — Project administrator configuration scope

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Configure a different project without that project role.

**Expected results**

- Project-admin rights do not grant access outside authorized projects.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0007"></a>
### UC-SYS-0007 — Archived project write denied

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Attempt an ordinary work mutation against archived project content.

**Expected results**

- Archived work stays read-only under shared authorization.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0008"></a>
### UC-SYS-0008 — Reauthorize accepted retry

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Replay an accepted business write after access is revoked.

**Expected results**

- A stored accepted result does not bypass current authorization.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0009"></a>
### UC-SYS-0009 — Replay accepted intent

Actor: `mcp_client` · Kind: `concurrency` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Repeat the same accepted mutation with the same caller, operation, payload and retry reference.

**Expected results**

- The stored result is replayed without a second business side effect.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0010"></a>
### UC-SYS-0010 — Reject changed retry payload

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Reuse a retry reference with a materially different mutation payload.

**Expected results**

- The second intent is rejected rather than being treated as the original request.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0011"></a>
### UC-SYS-0011 — Concurrent same retry

Actor: `mcp_client` · Kind: `concurrency` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Submit the same mutation reference concurrently.

**Expected results**

- One semantic business effect is accepted and subsequent equivalent attempts replay it.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0012"></a>
### UC-SYS-0012 — No-op write history

Actor: `mcp_client` · Kind: `concurrency` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Save a supported mutation with values equal to current values.

**Expected results**

- The feature no-op contract preserves content revision and avoids duplicate business-change history.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0013"></a>
### UC-SYS-0013 — Roll back failed mutation

Actor: `mcp_client` · Kind: `failure` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Cause a business validation failure before a transaction commits.

**Expected results**

- No partial accepted business state is exposed.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0014"></a>
### UC-SYS-0014 — Safe unconfirmed write error

Actor: `mcp_client` · Kind: `failure` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Interrupt a write so its outcome cannot be confirmed.

**Expected results**

- The response exposes a safe retry-same-reference action rather than internal database details.

Sources: [backend/internal/platform/command/transaction.go:153](../../../backend/internal/platform/command/transaction.go#L153).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0015"></a>
### UC-SYS-0015 — Default collection page size

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Read a shared paginated collection without an explicit limit.

**Expected results**

- The shared default is 25 items, subject to the envelope budget.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0016"></a>
### UC-SYS-0016 — Maximum collection page size

Actor: `mcp_client` · Kind: `performance` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request a shared collection limit of 100.

**Expected results**

- At most 100 items are emitted in a bounded page.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0017"></a>
### UC-SYS-0017 — Reject zero page limit

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request a page limit of zero.

**Expected results**

- Pagination validation rejects it.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0018"></a>
### UC-SYS-0018 — Reject excessive page limit

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request a page limit above 100.

**Expected results**

- Pagination validation rejects it.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0019"></a>
### UC-SYS-0019 — Reject tampered cursor

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Change a signed pagination cursor.

**Expected results**

- Cursor authentication rejects the altered token.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0020"></a>
### UC-SYS-0020 — Reject foreign caller cursor

Actor: `mcp_client` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Use another caller cursor with the same query.

**Expected results**

- Caller scoping prevents its use.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0021"></a>
### UC-SYS-0021 — Reject other operation cursor

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Use a cursor for a different paginated operation.

**Expected results**

- Operation scoping rejects continuation.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0022"></a>
### UC-SYS-0022 — Reject changed filter cursor

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Reuse a cursor after changing its normalized filter or sort scope.

**Expected results**

- The cursor is rejected instead of silently skipping or mixing results.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0023"></a>
### UC-SYS-0023 — Budget-truncated continuation

Actor: `mcp_client` · Kind: `performance` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Read rows whose serialized envelope reaches the page byte budget.

**Expected results**

- The continuation is based on the final emitted item; inspected but unsent rows are not skipped.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Related test files: [coverage-platform-budget.spec.ts](../../../frontend/e2e/coverage-platform-budget.spec.ts).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0024"></a>
### UC-SYS-0024 — Empty collection shape

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Read a shared collection with no matches.

**Expected results**

- Items is an empty array and no next cursor is advertised.

Sources: [backend/internal/platform/command/pagination.go:17](../../../backend/internal/platform/command/pagination.go#L17).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0025"></a>
### UC-SYS-0025 — Read liveness

Actor: `operator` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request GET /healthz.

**Expected results**

- A JSON status ok response is returned independently of database readiness.

Sources: [backend/internal/platform/httpapi/server.go:95](../../../backend/internal/platform/httpapi/server.go#L95).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0026"></a>
### UC-SYS-0026 — Read readiness success

Actor: `operator` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request GET /readyz when the readiness callback succeeds.

**Expected results**

- A JSON ready response is returned.

Sources: [backend/internal/platform/httpapi/server.go:95](../../../backend/internal/platform/httpapi/server.go#L95).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0027"></a>
### UC-SYS-0027 — Read readiness unavailable

Actor: `operator` · Kind: `failure` · Implementation: `service_only` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Request GET /readyz when readiness fails or times out.

**Expected results**

- HTTP 503 with JSON unavailable is returned.

Sources: [backend/internal/platform/httpapi/server.go:95](../../../backend/internal/platform/httpapi/server.go#L95).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0028"></a>
### UC-SYS-0028 — Maintenance service identity

Actor: `operator` · Kind: `happy_path` · Implementation: `external_pending` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Call the configured maintenance endpoint with an allowed verified Google service-account token and empty body.

**Expected results**

- The bounded maintenance operation runs with a no-store response.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

Note: Managed-provider acceptance requires an actual verified Google service-account token from the intended test service. Local fake-verifier unit checks are separate evidence and cannot verify this REST/operator journey. The real configured missing-credential boundary is UC-SYS-0029.

<a id="uc-sys-0029"></a>
### UC-SYS-0029 — Maintenance missing credential

Actor: `operator` · Kind: `permission` · Implementation: `service_only` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Call maintenance without a bearer credential.

**Expected results**

- HTTP 401 is returned and maintenance does not run.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

<a id="uc-sys-0030"></a>
### UC-SYS-0030 — Maintenance wrong identity

Actor: `operator` · Kind: `permission` · Implementation: `external_pending` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Call maintenance using an unapproved service identity.

**Expected results**

- The request is denied before maintenance execution.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

Note: Managed-provider acceptance requires an actual verified Google service-account token from the intended test service. Local fake-verifier unit checks are separate evidence and cannot verify this REST/operator journey. The real configured missing-credential boundary is UC-SYS-0029.

<a id="uc-sys-0031"></a>
### UC-SYS-0031 — Maintenance wrong audience

Actor: `operator` · Kind: `permission` · Implementation: `external_pending` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Call maintenance with a token that does not validate for its configured audience.

**Expected results**

- Authentication fails.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

Note: Managed-provider acceptance requires an actual verified Google service-account token from the intended test service. Local fake-verifier unit checks are separate evidence and cannot verify this REST/operator journey. The real configured missing-credential boundary is UC-SYS-0029.

<a id="uc-sys-0032"></a>
### UC-SYS-0032 — Maintenance unexpected body

Actor: `operator` · Kind: `validation` · Implementation: `external_pending` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Call maintenance with a positive Content-Length body.

**Expected results**

- HTTP 400 is returned instead of accepting caller-controlled input.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.

Note: Managed-provider acceptance requires an actual verified Google service-account token from the intended test service. Local fake-verifier unit checks are separate evidence and cannot verify this REST/operator journey. The real configured missing-credential boundary is UC-SYS-0029.

<a id="uc-sys-0033"></a>
### UC-SYS-0033 — Maintenance disabled configuration

Actor: `operator` · Kind: `lifecycle` · Implementation: `service_only` · Surfaces: `operator`, `rest`

**Preconditions**

- An isolated authorized environment is available with the described account, collection or configured endpoint state.

**Steps**

1. Omit required maintenance audience or service identities at registration.

**Expected results**

- The maintenance route is not registered.

Sources: [backend/internal/platform/httpapi/maintenance.go:36](../../../backend/internal/platform/httpapi/maintenance.go#L36).

Note: Shared invariant: apply to the relevant operation set when designing later tests; this entry alone is not per-operation coverage.
