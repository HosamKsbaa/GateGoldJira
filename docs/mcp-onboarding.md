# Connect your own account to MCP

Each person signs into GateGoldJira with the account provisioned for them. Do not share a personal token, another person's OAuth cache, or the private local identity directory.

## Native Antigravity panel

The [GateGoldJira plugin](../integrations/antigravity/README.md) bundles the MCP
bridge and a sidecar panel like HDM Flutter Studio. Extract the release and copy
its `gategoldjira` folder into `~/.gemini/config/plugins/` (Windows:
`%USERPROFILE%\.gemini\config\plugins\`). Reload Antigravity, enter the API server
URL in the GateGoldJira panel, save it and choose **Sign in with browser**.
There are no installation commands. The plugin registers its missing sidecar
preference on first MCP launch, preserving an explicitly disabled panel and all
unrelated settings. Each OS user keeps their own private connection. The package
contains no user credential. Disconnect revokes that connection for both the
panel and AI tools. The existing configuration-copy method below remains available.

## Browser OAuth through Antigravity IDE

1. Install Node.js 22 or newer with `npx` available to the IDE. The project pins Node 24 for development.
2. Sign into the GateGoldJira website and open **Account MCP connections** (`/account/mcp-tokens`).
3. Select **Copy OAuth configuration**. Merge the copied `gategoldjira` entry into your MCP configuration, preserving unrelated servers. Replace the previous entry for this server.
4. Reload the GateGoldJira MCP server. The pinned `mcp-remote` proxy opens your browser automatically. Sign in and approve the connection. If the browser does not open, use the authorization link from the MCP server logs.
5. Review the connection's activity or revoke it from the same account page.

The configuration contains the endpoint and public client information, without a user credential. The proxy stores OAuth credentials in that user's local credential cache and refreshes them. No IDE Authenticate button is required.

GateGoldJira's local OAuth server uses a pre-registered public client rather than dynamic registration. The generated configuration supplies `--static-oauth-client-info`, the exact `--resource` on authorization/token/refresh requests, the required scope and `--host 127.0.0.1` for the approved callback. A bare `npx mcp-remote <url>` does not include these settings. The proxy version is pinned to 0.15.1.

## Personal token alternative

For a host/version supporting remote HTTP servers with an Authorization header, open **Create a personal token instead**, enter a name, generate the token and select **Copy Antigravity config**. Merge that entry and reload the server. This config contains a secret: give each user their own token and keep it out of shared project files. Permanent personal tokens work until revoked and have separate activity histories.

## Sharing source versus hosting a team service

If each person runs a local copy of the project, localhost refers to their own machine and local database. Each copy needs its own initialized local accounts and services. These copies do not share project data automatically.

For one shared team workspace, deploy a reachable HTTPS web app and MCP endpoint and configure the production identity provider and approved users. The username/password adapter remains development-only and rejects remote service origins. A shared HTTPS/OIDC deployment can enable `MCP_BROWSER_OAUTH_ENABLED=true` to authorize the plugin through existing verified browser identities. The canonical API `/oauth` issuer then mints MCP-only credentials after per-user browser approval. Development passwords and signing keys never become a shared identity service. The Terraform candidate exposes `mcp_browser_oauth_enabled` (default true); disable it to retain direct managed-provider discovery. Test the configured provider and deployment before onboarding other users.

## Verification

`scripts/test-mcp-remote.sh` runs the copied configuration with the real pinned proxy, an isolated database and a private test credential cache. It exercises browser sign-in/approval, tool execution, cached reconnect after access expiry, activity attribution and owner revocation. It never reuses or clears a user's real MCP credential cache.
