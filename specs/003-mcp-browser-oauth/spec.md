# Browser authorization for MCP

Users connect Antigravity IDE with OAuth instead of copying a permanent account token. They sign into the existing website, review the client and callback, then approve or deny access. An approved connection uses current account/project permissions, has owner-only activity history, and can be revoked immediately.

The current installation uses local development identities and has no provisioned Auth0 tenant. Add a strictly loopback, development-only OAuth adapter. Production continues to delegate authorization to the configured managed identity provider. Keep personal tokens as an explicit fallback; switch this computer's Antigravity entry to OAuth after discovery and protocol checks pass.

Acceptance: discovery advertises a reachable issuer; registered public clients use authorization code plus mandatory S256 PKCE, exact approved callbacks and resource binding. Require explicit authenticated consent, preserve state/issuer, issue short-lived MCP-only access tokens and rotating refresh tokens, persist grants across restarts, and reject expired/replayed codes, wrong verifiers, wrong clients/resources, revoked connections and inactive accounts. Log tool calls per connection without secrets. Browser consent must survive the existing sign-in redirect and must never redirect to an unvalidated destination.
