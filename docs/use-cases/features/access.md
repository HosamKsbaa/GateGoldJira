# Authentication, sessions and company accounts

Atomic current account journeys, local-only password boundaries and managed identity candidates. Source-backed implementation status is not a runtime verification result. Existing test paths are related references, not claims of complete per-case coverage.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `login`: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16)
- `loginSubmit`: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67)
- `session`: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31)
- `credentials`: [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78)
- `provider`: [frontend/src/app/core/auth/sign-in.provider.ts:17](../../../frontend/src/app/core/auth/sign-in.provider.ts#L17)
- `oidc`: [frontend/src/app/core/auth/sign-in.provider.ts:41](../../../frontend/src/app/core/auth/sign-in.provider.ts#L41)
- `guards`: [frontend/src/app/core/auth/auth.guards.ts:6](../../../frontend/src/app/core/auth/auth.guards.ts#L6)
- `localServer`: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134)
- `localBoundary`: [backend/internal/platform/auth/local_login.go:60](../../../backend/internal/platform/auth/local_login.go#L60)
- `service`: [backend/internal/features/identity/service.go:94](../../../backend/internal/features/identity/service.go#L94)
- `approve`: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106)
- `update`: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163)
- `binding`: [backend/internal/features/identity/binding.go:25](../../../backend/internal/features/identity/binding.go#L25)
- `usersUi`: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159)
- `onboarding`: [identity/auth0/README.md:13](../../../identity/auth0/README.md#L13)
- `tenant`: [identity/auth0/README.md:3](../../../identity/auth0/README.md#L3)

## Cases

<a id="uc-acc-0001"></a>
### UC-ACC-0001 — Redirect protected entry to sign-in

Actor: `anonymous` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Open a protected URL without a session.

**Expected results**

- The sign-in route includes the requested local URL as returnTo.

Sources: [frontend/src/app/core/auth/auth.guards.ts:6](../../../frontend/src/app/core/auth/auth.guards.ts#L6).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0002"></a>
### UC-ACC-0002 — Sign in with local credentials

Actor: `anonymous` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Enter a valid local username and password and submit.

**Expected results**

- The approved identity is installed and the requested safe route opens.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67), [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78), [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-ACC-0062.

<a id="uc-acc-0003"></a>
### UC-ACC-0003 — Normalize local username

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit a valid username with uppercase letters and surrounding spaces.

**Expected results**

- The server resolves the normalized local username.

Sources: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0004"></a>
### UC-ACC-0004 — Preserve password spaces

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit credentials whose password includes significant spaces.

**Expected results**

- The original password bytes are checked without trimming.

Sources: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0005"></a>
### UC-ACC-0005 — Reject wrong password

Actor: `anonymous` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit an existing username with a wrong password.

**Expected results**

- A generic incorrect-credentials response is shown and no protected session is installed.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67), [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0006"></a>
### UC-ACC-0006 — Reject unknown username

Actor: `anonymous` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit a nonexistent username.

**Expected results**

- The same generic credential error is returned without identifying existing accounts.

Sources: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0007"></a>
### UC-ACC-0007 — Require username

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Leave username blank or whitespace only.

**Expected results**

- The local form cannot submit.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0008"></a>
### UC-ACC-0008 — Require password

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Leave password blank.

**Expected results**

- The local form cannot submit.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0009"></a>
### UC-ACC-0009 — Bound username length

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Enter more than 64 characters as the username.

**Expected results**

- The form or contract rejects the value.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16), [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-acc-0010"></a>
### UC-ACC-0010 — Bound password length

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit a password exceeding the supported 72-character form/server limit.

**Expected results**

- Credentials are rejected rather than silently truncated.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16), [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-acc-0011"></a>
### UC-ACC-0011 — Clear password during request

Actor: `anonymous` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit the local sign-in form.

**Expected results**

- The password field resets before the request completes.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0012"></a>
### UC-ACC-0012 — Prevent repeated busy submission

Actor: `anonymous` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit again while local login is in progress.

**Expected results**

- Busy controls prevent another form submission.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0013"></a>
### UC-ACC-0013 — Reject inactive approved identity

Actor: `anonymous` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Use correct local credentials for a disabled company account.

**Expected results**

- Access is denied before an account session is installed.

Sources: [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78), [backend/internal/features/identity/binding.go:25](../../../backend/internal/features/identity/binding.go#L25).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-acc-0014"></a>
### UC-ACC-0014 — Reject unapproved company identity

Actor: `anonymous` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Authenticate an identity whose verified email has no active approved company account.

**Expected results**

- Company data remains inaccessible.

Sources: [backend/internal/features/identity/binding.go:25](../../../backend/internal/features/identity/binding.go#L25).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0015"></a>
### UC-ACC-0015 — Show offline login failure

Actor: `anonymous` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit local login while the API request cannot complete.

**Expected results**

- An unavailable-service message appears and another attempt remains possible.

Sources: [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78), [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0016"></a>
### UC-ACC-0016 — Bound login attempts

Actor: `anonymous` · Kind: `performance` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Send requests beyond the local rate limit.

**Expected results**

- The login service returns a bounded busy/rate-limit failure.

Sources: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0017"></a>
### UC-ACC-0017 — Bound simultaneous password work

Actor: `anonymous` · Kind: `performance` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Exceed the local password-verification concurrency capacity.

**Expected results**

- Excess work fails busy instead of creating unbounded hashing work.

Sources: [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0018"></a>
### UC-ACC-0018 — End local session on reload

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Reload the browser after signing in locally.

**Expected results**

- The memory-only token disappears and protected navigation requires sign-in.

Sources: [frontend/src/app/core/auth/sign-in.provider.ts:17](../../../frontend/src/app/core/auth/sign-in.provider.ts#L17), [frontend/src/app/core/auth/sign-in.page.ts:16](../../../frontend/src/app/core/auth/sign-in.page.ts#L16).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0019"></a>
### UC-ACC-0019 — Sign out

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Choose sign out from a signed-in session.

**Expected results**

- Token, identity and protected session state clear.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31), [frontend/src/app/core/auth/sign-in.provider.ts:17](../../../frontend/src/app/core/auth/sign-in.provider.ts#L17).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0020"></a>
### UC-ACC-0020 — Discard superseded successful login

Actor: `anonymous` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `frontend_service`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Begin one login and replace the session before its successful reply arrives.

**Expected results**

- The older result returns superseded and cannot install the old account.

Sources: [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: This is an internal frontend AuthService epoch invariant. The current public sign-in form disables another submit while busy; it is not a browser journey. Real Go responses can be delayed without fabricating data in a typed Injector/LocalSignIn Playwright Node integration. Browser duplicate-submit protection is separately UC-ACC-0012.

<a id="uc-acc-0021"></a>
### UC-ACC-0021 — Discard superseded failed login

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `frontend_service`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Let an older failed login finish after a newer successful login.

**Expected results**

- The older reply cannot clear or replace the newer session.

Sources: [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: This is an internal frontend AuthService epoch invariant. The current public sign-in form disables another submit while busy; it is not a browser journey. Real Go responses can be delayed without fabricating data in a typed Injector/LocalSignIn Playwright Node integration. Browser duplicate-submit protection is separately UC-ACC-0012.

<a id="uc-acc-0022"></a>
### UC-ACC-0022 — Reject external return destination

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Supply an external URL as returnTo and complete local login.

**Expected results**

- Navigation falls back to the workspace.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0023"></a>
### UC-ACC-0023 — Reject protocol-relative return destination

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Supply a returnTo beginning with two slashes.

**Expected results**

- Navigation falls back to the workspace.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0024"></a>
### UC-ACC-0024 — Avoid sign-in redirect loop

Actor: `anonymous` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Supply the sign-in path as returnTo.

**Expected results**

- Successful local login opens the workspace instead of redirecting back to sign-in.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0025"></a>
### UC-ACC-0025 — Clear denied current session

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. A protected request returns an invalid or expired account-session response.

**Expected results**

- The current protected session clears.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0026"></a>
### UC-ACC-0026 — Refresh ordinary permission denial

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. A valid session attempts an operation returning forbidden.

**Expected results**

- The account is refreshed so an operation denial does not automatically invalidate all login state.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0027"></a>
### UC-ACC-0027 — Ignore old-session authorization failure

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. A delayed failed response arrives after the session epoch changed.

**Expected results**

- The response cannot clear the current newer session.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0028"></a>
### UC-ACC-0028 — Enforce account disable on next request

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Disable a currently signed-in account, then request protected data.

**Expected results**

- The next request denies access and the UI clears protected account state.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31), [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `get_me`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0029"></a>
### UC-ACC-0029 — Refresh changed administrator status

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Refresh identity after administrator privilege changes.

**Expected results**

- The session epoch changes and dependent protected views can discard stale privilege state.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31).

Shared business operations: `get_me`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-ACC-0059.

<a id="uc-acc-0030"></a>
### UC-ACC-0030 — Deny company administration route

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Open company users or company activity as a nonadministrator.

**Expected results**

- The route guard redirects away from the administration page.

Sources: [frontend/src/app/core/auth/auth.guards.ts:6](../../../frontend/src/app/core/auth/auth.guards.ts#L6).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0031"></a>
### UC-ACC-0031 — Read own company identity

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Read the current account through REST or get_me.

**Expected results**

- Only the caller identity, email, name, administrator flag and company timezone are returned.

Sources: [backend/internal/features/identity/service.go:94](../../../backend/internal/features/identity/service.go#L94).

Shared business operations: `get_me`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0032"></a>
### UC-ACC-0032 — Offer managed Google sign-in

Actor: `anonymous` · Kind: `happy_path` · Implementation: `external_pending` · Surfaces: `web`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Open sign-in in configured production identity mode and select Continue with Google.

**Expected results**

- The managed Google connection redirect begins; actual provider access remains pending tenant provisioning.

Sources: [frontend/src/app/core/auth/sign-in.provider.ts:41](../../../frontend/src/app/core/auth/sign-in.provider.ts#L41), [identity/auth0/README.md:3](../../../identity/auth0/README.md#L3).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Gaps: [GAP-ACC-001](../gaps.md#gap-acc-001).

<a id="uc-acc-0033"></a>
### UC-ACC-0033 — Refresh managed browser token

Actor: `user` · Kind: `lifecycle` · Implementation: `external_pending` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Use protected data after a configured managed login needs silent renewal.

**Expected results**

- The managed SDK requests a token for the REST audience and required scope; real provider verification is pending.

Sources: [frontend/src/app/core/auth/sign-in.provider.ts:41](../../../frontend/src/app/core/auth/sign-in.provider.ts#L41), [identity/auth0/README.md:3](../../../identity/auth0/README.md#L3).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Gaps: [GAP-ACC-001](../gaps.md#gap-acc-001).

<a id="uc-acc-0034"></a>
### UC-ACC-0034 — Log out managed identity

Actor: `user` · Kind: `lifecycle` · Implementation: `external_pending` · Surfaces: `web`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Sign out after managed Google login.

**Expected results**

- The provider logout flow returns to the application origin; real tenant behavior remains externally unverified.

Sources: [frontend/src/app/core/auth/sign-in.provider.ts:41](../../../frontend/src/app/core/auth/sign-in.provider.ts#L41), [identity/auth0/README.md:3](../../../identity/auth0/README.md#L3).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Gaps: [GAP-ACC-001](../gaps.md#gap-acc-001).

<a id="uc-acc-0035"></a>
### UC-ACC-0035 — Reject unsafe local deployment

Actor: `operator` · Kind: `permission` · Implementation: `implemented` · Surfaces: `operator`

**Preconditions**

- The operator is inspecting documented deployment settings without exposing credentials.

**Steps**

1. Configure password fixtures outside explicit loopback local development.

**Expected results**

- Startup refuses to expose the local password adapter.

Sources: [backend/internal/platform/auth/local_login.go:60](../../../backend/internal/platform/auth/local_login.go#L60).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-acc-0036"></a>
### UC-ACC-0036 — Read approved company accounts

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Open Company users as a company administrator.

**Expected results**

- Approved accounts show identity, active/admin flags and current revision.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159), [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `list_users`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0037"></a>
### UC-ACC-0037 — Page company directory

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Request another approved-user page.

**Expected results**

- A bounded next page is returned in directory order.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `list_users`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0038"></a>
### UC-ACC-0038 — Deny global user directory to project reader

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Request list_users without company administrator access.

**Expected results**

- Global account details remain unavailable.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `list_users`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0039"></a>
### UC-ACC-0039 — Approve company user

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Submit an approved email and display name without the administrator flag.

**Expected results**

- A company account is created without granting project membership or provisioning a password.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106), [identity/auth0/README.md:13](../../../identity/auth0/README.md#L13).

Shared business operations: `approve_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0040"></a>
### UC-ACC-0040 — Approve company administrator

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve a company account with the administrator flag selected.

**Expected results**

- The new approved account has company administrator privileges.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `approve_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0041"></a>
### UC-ACC-0041 — Preserve Arabic display name

Actor: `company_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve or rename an account using Arabic or mixed-language text.

**Expected results**

- The name is retained and rendered with automatic direction.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159), [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `approve_user`, `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-ACC-0060.

<a id="uc-acc-0042"></a>
### UC-ACC-0042 — Reject invalid approval email

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve an account with a malformed email.

**Expected results**

- Validation rejects the approval.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `approve_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0043"></a>
### UC-ACC-0043 — Reject duplicate approved email

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve an email already used by a company account.

**Expected results**

- The command rejects a duplicate account rather than creating another identity.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `approve_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0044"></a>
### UC-ACC-0044 — Bound display name

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve or edit an account with an empty or over-100-character display name.

**Expected results**

- The account change is rejected with field validation.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106), [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `approve_user`, `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0045"></a>
### UC-ACC-0045 — Edit approved email

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Save a new valid company email at the current account revision.

**Expected results**

- The new email is stored without silently creating another user.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0046"></a>
### UC-ACC-0046 — Edit account display name

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Save a changed account display name at its current revision.

**Expected results**

- The updated name appears in the refreshed company directory.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-ACC-0063.

<a id="uc-acc-0047"></a>
### UC-ACC-0047 — Disable account

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Turn off Active account and save.

**Expected results**

- Current access ends and assignments that are no longer eligible are cleared.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0048"></a>
### UC-ACC-0048 — Reactivate account

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Restore Active account and save.

**Expected results**

- The approved account becomes eligible for access; cleared assignments do not reappear automatically.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0049"></a>
### UC-ACC-0049 — Grant company administrator

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Enable Company administrator on an existing account.

**Expected results**

- Company-wide privileges apply after current identity refresh.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0050"></a>
### UC-ACC-0050 — Remove company administrator

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Remove administrator privilege while another active administrator remains.

**Expected results**

- The account keeps only its current project roles.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0051"></a>
### UC-ACC-0051 — Protect final active administrator from disable

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Attempt to disable the last active administrator.

**Expected results**

- The save is rejected with guidance to retain an active administrator.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0052"></a>
### UC-ACC-0052 — Protect final active administrator from demotion

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Attempt to remove the last active administrator flag.

**Expected results**

- The save is rejected.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0053"></a>
### UC-ACC-0053 — Review account conflict

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Submit a stale account revision and select Review current account.

**Expected results**

- The conflict exposes current account values and explicit review repopulates the edit form.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-ACC-0061.

<a id="uc-acc-0054"></a>
### UC-ACC-0054 — Cancel account edit

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Open an account editor and select Cancel.

**Expected results**

- The form resets without changing the account.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0055"></a>
### UC-ACC-0055 — Retry uncertain account change

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Repeat an accepted account change using its original retry reference and body.

**Expected results**

- The same business result is returned without duplicate account or audit change.

Sources: [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106), [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `approve_user`, `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0056"></a>
### UC-ACC-0056 — Clear company directory on account switch

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Switch accounts while directory or save requests are pending.

**Expected results**

- Old rows, drafts and delayed responses cannot populate the new session.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0057"></a>
### UC-ACC-0057 — Explain local approval boundary

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Open Approve a user in local development.

**Expected results**

- The page states approval grants company access and does not create a local username or password.

Sources: [identity/auth0/README.md:13](../../../identity/auth0/README.md#L13), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-acc-0058"></a>
### UC-ACC-0058 — Explain invitation boundary

Actor: `company_admin` · Kind: `happy_path` · Implementation: `external_pending` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve an employee account in managed mode.

**Expected results**

- The documented onboarding shares the workspace URL separately; approval does not send invitation email.

Sources: [identity/auth0/README.md:13](../../../identity/auth0/README.md#L13).

Shared business operations: `approve_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Source-backed verification boundary: the exact managed-mode employee approval/onboarding expectation is retained. Local username/password approval is not managed Google onboarding; the Auth0 tenant and real managed identity are not provisioned. See identity/auth0/README.md (managed identity deployment candidate) and frontend/src/app/features/administration/pages/users/users.page.ts (managed invitation notice).

<a id="uc-acc-0062"></a>
### UC-ACC-0062 — Exchange valid local credentials

Actor: `anonymous` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- No application session is installed; local cases use explicit loopback development unless the scenario describes the managed provider.

**Steps**

1. Submit a valid local username and password to the local sign-in endpoint.

**Expected results**

- The server returns a bearer token for the active approved caller without a password or other account identity.

Sources: [frontend/src/app/core/auth/sign-in.page.ts:67](../../../frontend/src/app/core/auth/sign-in.page.ts#L67), [frontend/src/app/core/auth/auth.service.ts:78](../../../frontend/src/app/core/auth/auth.service.ts#L78), [backend/internal/platform/auth/local_login.go:134](../../../backend/internal/platform/auth/local_login.go#L134).

Browser-only HTTP operations: `localSignIn`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-ACC-0002; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-acc-0059"></a>
### UC-ACC-0059 — Read current changed administrator privilege

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the account/session state described in the scenario; protected data requires current approval and access.

**Steps**

1. Read get_me after the caller company administrator privilege changes.

**Expected results**

- The returned administrator flag reflects current persisted authorization rather than token-time privilege.

Sources: [frontend/src/app/core/auth/auth.service.ts:31](../../../frontend/src/app/core/auth/auth.service.ts#L31).

Shared business operations: `get_me`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-ACC-0029; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-acc-0060"></a>
### UC-ACC-0060 — Preserve Arabic account text through service contracts

Actor: `company_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Approve or rename an account using Arabic or mixed-language text.

**Expected results**

- The typed account result and subsequent directory read preserve the exact display name.

Sources: [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159), [backend/internal/features/identity/service.go:106](../../../backend/internal/features/identity/service.go#L106).

Shared business operations: `approve_user`, `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-ACC-0041; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-acc-0063"></a>
### UC-ACC-0063 — Persist account display-name changes

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Save a changed display name using the current account revision.

**Expected results**

- The typed saved account returns the exact updated display name and a new revision.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-ACC-0046; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-acc-0061"></a>
### UC-ACC-0061 — Return current account in a stale-write conflict

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is a current approved company administrator; the target account exists unless the case approves a new account.

**Steps**

1. Submit an outdated account revision.

**Expected results**

- A typed conflict returns the current approved account and the stale change does not overwrite it.

Sources: [backend/internal/features/identity/service.go:163](../../../backend/internal/features/identity/service.go#L163), [frontend/src/app/features/administration/pages/users/users.page.ts:159](../../../frontend/src/app/features/administration/pages/users/users.page.ts#L159).

Shared business operations: `update_user`.

Related test files: [access.spec.ts](../../../frontend/e2e/access.spec.ts), [auth.service.spec.ts](../../../frontend/src/app/core/auth/auth.service.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-ACC-0053; it does not claim browser rendering, form state, session epochs or download assembly.
