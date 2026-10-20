# GateGoldJira Antigravity plugin

Users install a native Antigravity plugin with a right-hand sidecar panel, sign
into their own GateGoldJira account in the browser, and use the existing remote
MCP tools through that same connection. The package contains no credentials.

Acceptance scenarios:
- A fresh installation shows a configurable MCP endpoint and website, signed-out
  state, and a browser sign-in action. No company data is loaded before approval.
- OAuth uses S256 PKCE, random state, an IP loopback callback and exact issuer and
  resource checks. Denial, cancellation and timeouts leave no usable credential.
- The panel and stdio MCP bridge share a private, per-OS-user connection. Refresh
  is serialized across processes, including retries after access-token expiry.
- Signed-in users see their identity, accessible projects and a bounded issue
  search. All reads and AI mutations use the existing backend MCP permissions and
  activity logging. Successful tool results retain their browser links.
- Disconnect revokes this connection on the server and removes local credentials.
  A different user can then sign in without inheriting the previous user's data.
- The distributable and installer preserve unrelated plugins and MCP settings.
- Local password login stays loopback-only. A shared HTTPS deployment can opt into
  the same OAuth broker using its existing verified browser identity provider.

No deployment, new password database, marketplace publication or additional IDE
extension is included. The server has not been deployed yet.

Copy-only installation follow-up:
- Copy the release's `gategoldjira` folder into Antigravity's plugins directory
  and reload; no installer, terminal commands, npm or workstation paths.
- The native MCP definition uses plugin-relative working paths. On first bridge
  startup register only the missing GateGoldJira panel preference, preserving
  unrelated settings, JSON comments and an explicitly disabled panel.
- Fresh profiles have no server default. Users enter the API server URL in the
  panel; the server advertises its website, with a manual override for older
  deployments. Each person then approves OAuth using their own account.
- Copying or replacing the public plugin folder never copies private credentials.
