# Validation

Completed locally on 2026-10-16 (Africa/Cairo).

- OAuth/credential/runtime-grant integration tests passed with the race detector, including PKCE, state/issuer, code/consent replay, refresh rotation and reuse revocation, expiry, inactive accounts, viewer permissions, restart persistence, MCP-only credentials and credential hashing.
- All PostgreSQL migration tests passed through migration 22.
- Official Go MCP SDK connected through discovery and the real local authorization/consent/code-exchange endpoints and called get_me successfully.
- Browser OAuth sign-in/approval, tool use, activity and revocation passed; personal-token fallback browser test also passed. OAuth test allowance is 60 seconds for the multi-step flow; successful run took 10.4 seconds on a busy host.
- Frontend type/template/test checking, 114 unit tests and production build passed. Go vet, architecture, contract and generated-file checks passed.
- Migration 22 applied to the local development database; API restarted successfully with settings preserved and a rollback binary.
- Antigravity shared and IDE configurations now contain the local endpoint and public OAuth client ID without a static Authorization header. Other server entries were preserved in place and private backups saved.
- Only the old personal token named Antigravity on this computer was revoked; its next request returned 401. Personal-token fallback and other users' credentials remain available.

The original direct OAuth setup assumed an Authenticate button. The current onboarding uses the mcp-remote stdio proxy so reloading the GateGoldJira server starts browser authorization. The user signs into the browser with their own local account and approves the connection. No access/refresh credential was manually injected into Antigravity. Actual IDE authentication remains an interactive user step; automated compatibility evidence covers the official client and browser flow. This local adapter is unavailable in production, which retains its managed-provider configuration.

## Antigravity proxy onboarding correction

The account page and local setup helper now generate a pinned `mcp-remote@0.15.1` stdio configuration instead of relying on an IDE Authenticate control. The generated args explicitly supply the registered public client, scope, resource on all OAuth requests, HTTP transport, IP loopback callback and a 180-second browser-approval allowance. Current proxy dependencies require Node >=20.18.1; user instructions require Node 22 or newer and the project tests use Node 24.

`scripts/test-mcp-remote.sh` passed the actual config copied from the browser clipboard through the real proxy: browser sign-in/approval, get_me, process restart with a private cache, refresh after server-side access expiry without another approval, two correctly attributed activity entries and owner revocation. The successful acceptance case took 12.2 seconds (31.7 seconds including runner setup). This verifies more than a JSON example or a simulated client. Frontend type/template/test checking, all 114 unit tests and production build passed. Desktop/mobile live-page checks confirmed the new instructions without a credential reveal.

Both local Antigravity config locations now use the proxy command and have no direct serverUrl or Authorization header for GateGoldJira. Other MCP entries remain intact. No other MCP credential caches were cleared or changed. Team deployment requirements are documented separately in `docs/mcp-onboarding.md`; the loopback-only development adapter was not exposed remotely.

## Native plugin follow-up

Feature 004 adds a native sidecar UI and a shared HTTPS broker option. The original
local password restrictions still apply. With explicit enablement, production
consent uses existing verified OIDC browser identities; protocol endpoints and
MCP-only credentials can now operate on a shared server. See feature 004 for the
new revocation, packaging and account-switching evidence.
