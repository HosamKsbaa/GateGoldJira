# Copy-only release validation — 2026-10-17

Release `gategoldjira-antigravity-1.1.0.zip` contains 14 public files (669,506
bytes). It ships native plugin-relative MCP configuration, an empty first-run
connection, bundled dependencies and no installer. No workstation path, private
connection file or credential-shaped value is present in the ZIP. Package
verification is now part of `scripts/package-antigravity-plugin.sh`: it extracts
the exact archive into a path with spaces, starts its native stdio configuration,
moves it to a path with Unicode characters, and starts it again. Both launches
return all 133 tools, register the missing panel preference, and block signed-out
calls. The same archive passes with Antigravity Manager's bundled Node 24.20.0.

Eleven TypeScript tests pass, including JSONC preference preservation, concurrent
first launch, explicit panel disablement, corrupt preference protection, fresh
unconfigured profiles, URL normalization and website discovery, and upgrading
an existing default-server OAuth connection without replacing its credential.
The existing PKCE, issuer/state, refresh, denial/cancel, account-switch and legacy
installer checks also pass. A bundled JSONC module issue found by the first copy
acceptance attempt was corrected by selecting the dependency's ESM build.

Final real-browser acceptance passed in 6.9s (20.8s with startup), using a copied
package, the actual Antigravity sidecar SDK and a disposable PostgreSQL database.
It verifies empty first-run fields and disabled sign-in, one-URL setup with
website discovery, member approval, projects, MCP issue creation and result link,
search, concurrent local/server expiry refresh, disconnect, viewer authorization
and mutation denial, revocation and account-attributed activity. Sidecar APIs
reject unauthenticated access; browser output contains no OAuth credentials.
First-run, 320px, desktop and dark views were visually checked. Frontend test
TypeScript, Go mcpapi tests and feature/platform architecture checks pass.

The local development API was rebuilt and restarted without a migration, retaining
its existing environment/database; readiness and public website discovery pass.
Only the local GateGoldJira plugin folder was replaced, with a private rollback
copy. Its existing credential hash and global preferences are unchanged. The old
connection's default server settings were recovered into private user state.
Native `agy plugin validate` passes and discovery reports GateGoldJira enabled
with its MCP server. Reload Antigravity to load the updated panel.

Native desktop UI placement was not automated: panel interaction uses the actual
SDK in Chromium, plus native CLI validation/discovery. Runtime checks here are on
Linux. The shared service remains undeployed and still requires canonical HTTPS
origins and the configured production browser identity provider. This release
changes client installation; it does not deploy a shared server.

---

# Validation — 2026-10-16

Built the native plugin under `integrations/antigravity` and installed it at
`~/.gemini/config/plugins/gategoldjira`. Antigravity CLI discovery reports it
enabled with the `gategoldjira` MCP server. The installer enabled the auxiliary
sidecar panel and replaced duplicate GateGoldJira MCP entries, preserving other
servers and configuration. Backups and a restore manifest are private in the
user's `.gemini/gategoldjira-backups` directory. No user credential was imported,
printed or embedded in the package.

Verification:
- Strict plugin TypeScript checking and bundled Node/browser builds passed.
- Six integration-client tests passed: installer preservation and upgrade,
  PKCE/state/issuer validation (including malformed Unicode state), private file
  permissions, denial/cancellation, serialized refresh, HTTPS boundaries, and
  preventing an old request from retrying under a newly signed-in account.
- Go feature/configuration tests, `go vet ./...`, architecture checks and focused
  PostgreSQL integration tests with the race detector passed. The database run
  covered OAuth, personal tokens, runtime grants and isolated connection revocation
  in 121.9 seconds. Existing official Go MCP SDK OAuth acceptance passed in 13.0s.
- OpenAPI and MCP output match their generated files, and sqlc regeneration has
  no drift. No schema migration was introduced. Terraform formatting passed;
  no Terraform plan/apply, cloud provisioning or publication was performed.
- Real browser acceptance used the installed Antigravity `sidecar_sdk`, two
  independent stdio bridge processes and a disposable PostgreSQL database. It
  exercised member sign-in and approval, project browsing, issue creation and its
  URL, issue search, refresh after both local and server-side expiry, disconnect,
  viewer sign-in, denied viewer mutation, activity attribution and revocation.
  Concurrent clients rotated once for each expiry event, without reapproval.
  The final browser scenario passed in 10.4s (26.7s including web runner startup).
  Signed-out tool calls and unauthenticated sidecar APIs were blocked. No browser
  errors occurred; 320px, wide and dark panel views were visually checked.
- The exact ZIP was extracted and installed into a temporary home using the
  user's Node 22.22.3 runtime. Its bridge returned all 133 tool definitions and
  blocked signed-out calls; its sidecar started with the real SDK. The archive
  contains 14 public files and no machine-specific path or credential-shaped
  value. Third-party notices cover bundled dependency inputs.

The live local API was restarted with the verified binary, retaining its existing
environment and database. Readiness and OAuth revocation discovery passed. The
previous binary is retained for local rollback. The newly installed plugin starts
signed out; the user must reload Antigravity and approve their own connection.
Native panel placement was configured and discovered; automated UI evidence uses
the real sidecar SDK in a browser rather than driving the desktop Agent Manager.

The shared service is not deployed. Shared use requires canonical HTTPS API/web
origins, a provisioned production OIDC browser login and approved user accounts.
`MCP_BROWSER_OAUTH_ENABLED=true` opts into the broker; the Terraform candidate
exposes the same setting. Development username/password fixtures remain strictly
loopback-only. Credentials are private local files, not OS-keychain entries. The
plugin uses one account per OS profile; separate profiles support separate users.
The installer is portable Node code, but runtime verification here was on Linux.
