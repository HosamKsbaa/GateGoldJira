# GateGoldJira for Antigravity

Native Antigravity plugin with a side panel, all published GateGoldJira MCP tools,
and browser OAuth using each person's own account. The release is ready to copy:
no terminal, installer, npm, personal token or configuration-file editing.

## Install on any device

1. Download and extract `gategoldjira-antigravity-1.1.0.zip`.
2. Copy the **gategoldjira** folder into your Antigravity plugins folder:
   - macOS / Linux: `~/.gemini/config/plugins/`
   - Windows: `%USERPROFILE%\.gemini\config\plugins\`
3. Reload Antigravity and open **GateGoldJira** in its side panel.
4. Enter your company's **API server URL**, for example
   `https://api.your-company.com` (the `/mcp` suffix is optional), and select
   **Save server settings**.
5. Select **Sign in with browser**, sign into your own GateGoldJira account and
   approve the connection. If a popup is blocked, choose **Continue sign-in in
   your browser** in the panel.

The folder must contain `plugin.json` directly; avoid accidentally nesting
`gategoldjira/gategoldjira`. Use a current Antigravity version with sidecar web UI,
authenticated sidecar requests and plugin-relative MCP working directories
(1.1.28 or newer). Antigravity Manager supplies its Node runtime and sidecar SDK.
A host build that does not supply Node must have Node 22.18+ available on PATH.
The bundled plugin has no dependencies to install.

On its first native MCP startup the plugin adds **only a missing**
`gategoldjira/studio` sidecar preference in `~/.gemini/config/config.json`.
Unrelated settings and JSON comments are preserved, with a private backup in
`~/.gemini/gategoldjira`. An explicitly disabled panel stays disabled. If you
previously disabled it, enable GateGoldJira under Antigravity's sidecar settings.
If the panel is not visible after initial discovery, reload Antigravity once more.
Antigravity may also ask you to trust or enable the copied plugin in its UI.

Your server advertises its website address automatically. For an older server,
open **Advanced settings** and enter **Website URL override**. For local testing,
enter `http://localhost:21080`; the current backend detects the website on port
4201. Localhost always means the device running Antigravity, so team members need
a deployed, reachable server URL.

To upgrade, close/reload Antigravity and replace this public plugin folder with
the new release. Server settings and credentials live outside it and survive the
replacement. A previous installer or manually configured GateGoldJira MCP entry
may appear twice: disable the old entry in Antigravity Customizations and keep the
plugin's MCP entry. No installation script is required or included in this release.

## Accounts and privacy

The panel and AI tools share one account per operating-system user profile.
Private connection state is outside the plugin in `~/.gemini/gategoldjira`
(directory 0700, credential files 0600 on Unix). Credentials are local private
files, not OS-keychain entries. Share only the public plugin folder or ZIP;
never share the private directory or one OS profile between different people.
Each teammate configures the server and signs in separately on their device.
`GATEGOLDJIRA_DATA_DIR` can select a separate private profile.

No password, bearer token or refresh token is placed in MCP configuration or
returned to the panel. The callback listens on an ephemeral IP loopback port and
checks PKCE, state, issuer and resource. Cross-process refresh is serialized
because refresh tokens rotate. Access lasts 15 minutes; refresh is automatic
within a 30-day authorization window. Sign in again after expiry or revocation.

Disconnect revokes the connection before deleting local credentials. If the
server is offline, retry later or revoke from **Account → MCP connections**.
Cancel closes a pending sign-in. Disconnect before changing accounts or servers.
All tools use the existing backend permissions and activity logs; successful
results retain their website links. The panel links to connection activity.

## Shared server configuration

The shared service is not deployed yet. A deployment needs canonical HTTPS API
and website URLs, the existing production browser identity provider, approved
company accounts, and `MCP_BROWSER_OAUTH_ENABLED=true`. Users authorize their own
verified identities. Development username/password fixtures remain loopback-only;
changing localhost to a LAN address does not enable a production login.
No cloud resources or marketplace listing are created by copying this plugin.

## Develop and verify

From `integrations/antigravity`, run `npm ci`, `npm run typecheck`, `npm test`, and
`npm run build`. The build copies the generated backend MCP catalog and bundles
the pinned official MCP TypeScript SDK. The host supplies `sidecar_sdk` at runtime.
Use `scripts/test-antigravity-plugin.sh` for isolated real-browser acceptance,
and `scripts/package-antigravity-plugin.sh` to build the distributable ZIP.
The tests use private temporary data and native configuration directories;
no real OAuth cache or global preference is reused. The old installer source is
retained for legacy tests but is excluded from the copy-only release.
