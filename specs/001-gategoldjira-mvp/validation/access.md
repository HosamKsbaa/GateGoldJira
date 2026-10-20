# Local account access evidence

Date: 2026-10-12. Status: original US1 local checkpoint and all ten MVP stories pass locally. The requested development username/password addendum now passes the full backend, frontend and browser checks below.

Pinned Go1.27.2, PostgreSQL18.6, Angular22.2.2, Node24.21.0, Playwright1.64.0/Chromium156.0.8078.4. Local development identities use genuine RS256 access tokens with separate REST/MCP audiences, never an anonymous impersonation endpoint.

- All Go packages passed `go test -race ./...` against real isolated databases. Account-specific checks passed again after typed conflict decoding was added; `go vet ./...` passed.
- Generated API/SQL/client drift and feature/platform import-boundary checks passed. The original identity checkpoint registered nine identity operations; the completed business catalog now registers50 operations.
- Angular application/templates and test TypeScript checks passed. All32 frontend unit tests passed, including Unicode/revision contracts, configuration isolation, generated mutation headers, request retries and delayed-response/session-change races.
- All3 actual Chromium access tests passed in an isolated temporary PostgreSQL database: Arabic approval, Member/Viewer changes, deep-link sign-in, private-state clearing after sign-out/reload, the next-request disable guard, last active Administrator protection, and focus at768px. The harness dropped the temporary database afterward.
- The tablet screenshot was inspected: readable names and Arabic direction, labeled forms, visible text states, no horizontal overflow. Local screenshot: `.local/browser-evidence/access-owner-tablet.png`.
- Official Go-SDK HTTP tests prove the authenticated caller reaches MCP services and a subsequent request observes Administrator removal. Same-reference approval replay retains the original event/result across REST/MCP service channels.

Unrun external gates: real Google/Auth0 tenant sign-in, registered MCP OAuth client/assistant workflows, employee usability, and Google Cloud performance/recovery. No tenant or cloud target was provisioned; the user chose to continue locally.

## Development username/password addendum

DEV-AUTH-001 replaces the token-paste form with labeled Username and Password controls. Local identity commands generate random passwords for existing Owner/Member/Viewer/Disabled fixtures and preserve them on repeated runs. Private ignored `accounts.json` gives the developer the generated credentials; `credentials.json` stores bcrypt hashes and fixed fixture identities. The development-only typed exchange issues a fresh short-lived signed token after current active-company checks. Production/Cloud Run cannot register it; managed production OAuth remains an external gate.

Updated browser coverage uses actual generated credentials and PostgreSQL: all three active roles, wrong-password401, inactive-account403, a second login without refreshing fixture tokens, no local/session storage or cookies, and clearing protected state on sign-out/reload. Keyboard acceptance uses the new fields. Programmatic REST/MCP tests continue using audience-specific token files. The earlier checkpoint counts above are historical evidence.

- Strict Angular templates/application and test TypeScript compilation (including E2E) pass. All62 current frontend unit tests pass.
- The complete actual Chromium suite passes29 tests, with only the opt-in timing test skipped. Private run artifacts: `.local/browser-tests/07ca1aeaa3cf48b8b8c434f8178a5861/`. The isolated runner creates fresh credentials and PostgreSQL data and drops the database after the run.
- Real PostgreSQL `backend/cmd/gategoldjira/fixtures_test.go` and focused race checks pass: repeated fixture setup preserves passwords, files have private permissions, runtime records contain hashes rather than plaintext passwords, Owner signs in with current Admin state, wrong/unknown credentials and Disabled/current-revoked users cannot reach company data, oversized credential bodies and caller-supplied identity claims are rejected, and the endpoint is absent outside development mode.
- The running local API and frontend proxy both return200 for a valid Owner sign-in; the visible local page has Username and Password fields. No credentials are included in this evidence document.
- The production frontend builds at767.41kB raw/~168.13kB estimated transfer; the existing600kB warning remains visible and the1MB error cap passes.

The final real PostgreSQL full Go race suite and vet pass with the additional authentication and HTTP security tests included: `REQUIRE_POSTGRES_TESTS=1 go test -race -p2 -count=1 ./...` followed by `go vet ./...`. This rerun includes the50-operation parity/revocation/retry matrix and maximum-picture round trip. Generated-client drift and feature/platform architecture checks pass. All five local sign-in tasks T150–T154 are complete. The total is146 of154 tasks, with eight original external validation/hosting tasks still pending; no real production OAuth or Cloud acceptance is claimed.
