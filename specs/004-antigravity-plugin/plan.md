# Implementation plan

Add `integrations/antigravity` with strict TypeScript, the pinned official MCP
TypeScript SDK, a sidecar entry point, stdio bridge, and a native plugin package.
Build distributable JavaScript with pinned esbuild; Antigravity supplies its own
sidecar SDK at runtime. The panel uses HTML/CSS and compiled TypeScript, matching
the installed HDM Flutter Studio sidecar API and auxiliary-pane manifest.

Store settings and credentials outside the package in a private user directory.
Serialize credential exchange, refresh, disconnect and endpoint changes with an
exclusive filesystem lock. Never pass credentials through browser state, MCP
configuration, stdout or process arguments. Validate every external boundary.
Discover only the configured GateGoldJira origin's OAuth broker; reject insecure
shared origins and credential-bearing redirects. Do not retry MCP mutations.

The Go OAuth broker remains the authority. Add RFC 7009 connection revocation and
an explicit HTTPS/OIDC shared-server switch; retain strict local login guards.
No schema migration is needed. SQL queries remain sqlc-generated.

Constitution check: existing Go services and PostgreSQL own all business rules;
the local Node process is required by Antigravity's native sidecar interface, not
a hosted service. The sidecar is an integration client rather than a second web
application. Runtime validation and strict types apply throughout. There is no
additional hosting cost. Lists are capped at 25 records per page, calls time out,
and background polling does not continually fetch company data. OAuth and refresh
tests use real PostgreSQL and isolated browser fixtures; visual checks cover narrow
and wide panel sizes. Installation is tested with isolated private profile paths.

Copy-only follow-up: ship a native `mcp_config.json` with `cwd: "."` and relative
bridge arguments, supported by Antigravity's plugin-root resolution. Use the
host's Node runtime. On first MCP startup atomically add only an absent sidecar
preference, using JSONC edits and private backup; preserve explicit disablement.
Keep connection defaults null, validate an API origin or `/mcp` address, and
discover the public website from protected-resource metadata. Test a copied and
moved package, fresh panel configuration, existing OAuth flows and permissions.
