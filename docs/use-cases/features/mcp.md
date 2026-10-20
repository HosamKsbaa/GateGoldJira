# MCP protocol, account connections and native Antigravity plugin

Business tool behavior is canonical in its domain. This area documents authentication, browser-only credential management, OAuth, activity privacy, proxy onboarding and native plugin interaction. Real managed provider/shared deployment remains pending. Related test paths are references, not proof of per-case execution.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `ui`: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2)
- `reveal`: [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10)
- `page`: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19)
- `clipboard`: [frontend/src/app/features/account/mcp-tokens.page.ts:104](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L104)
- `activityUi`: [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130)
- `consentUi`: [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32)
- `personal`: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104)
- `list`: [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83)
- `revoke`: [backend/internal/features/mcptokens/service.go:141](../../../backend/internal/features/mcptokens/service.go#L141)
- `authenticate`: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157)
- `http`: [backend/internal/features/mcptokens/http.go:29](../../../backend/internal/features/mcptokens/http.go#L29)
- `activity`: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31)
- `activityStart`: [backend/internal/features/mcptokens/activity.go:59](../../../backend/internal/features/mcptokens/activity.go#L59)
- `oauthSetup`: [backend/internal/features/mcptokens/oauth.go:33](../../../backend/internal/features/mcptokens/oauth.go#L33)
- `metadata`: [backend/internal/features/mcptokens/oauth.go:90](../../../backend/internal/features/mcptokens/oauth.go#L90)
- `authorize`: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124)
- `consent`: [backend/internal/features/mcptokens/oauth.go:169](../../../backend/internal/features/mcptokens/oauth.go#L169)
- `decision`: [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184)
- `exchange`: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231)
- `oauthRevoke`: [backend/internal/features/mcptokens/oauth.go:335](../../../backend/internal/features/mcptokens/oauth.go#L335)
- `server`: [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24)
- `protected`: [backend/internal/platform/mcpapi/server.go:49](../../../backend/internal/platform/mcpapi/server.go#L49)
- `registry`: [backend/api/mcp-tools.json:1](../../../backend/api/mcp-tools.json#L1)
- `identityNotes`: [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19)
- `pluginGuide`: [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7)
- `pluginPrivacy`: [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48)
- `pluginShared`: [integrations/antigravity/README.md:70](../../../integrations/antigravity/README.md#L70)
- `pluginUi`: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42)
- `pluginSearch`: [integrations/antigravity/src/ui.ts:154](../../../integrations/antigravity/src/ui.ts#L154)
- `pluginSettings`: [integrations/antigravity/src/server-settings.ts:5](../../../integrations/antigravity/src/server-settings.ts#L5)
- `pluginOauth`: [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21)
- `pluginRefresh`: [integrations/antigravity/src/oauth.ts:149](../../../integrations/antigravity/src/oauth.ts#L149)
- `pluginDisconnect`: [integrations/antigravity/src/oauth.ts:199](../../../integrations/antigravity/src/oauth.ts#L199)
- `pluginStore`: [integrations/antigravity/src/store.ts:10](../../../integrations/antigravity/src/store.ts#L10)
- `panelPreference`: [integrations/antigravity/src/panel-preference.ts:26](../../../integrations/antigravity/src/panel-preference.ts#L26)
- `pluginMcp`: [integrations/antigravity/src/mcp.ts:38](../../../integrations/antigravity/src/mcp.ts#L38)
- `legacySearchGate`: [backend/internal/features/issues/search.go:146](../../../backend/internal/features/issues/search.go#L146)
- `pluginModel`: [integrations/antigravity/src/models.ts:47](../../../integrations/antigravity/src/models.ts#L47)

## Cases

<a id="uc-mcp-0001"></a>
### UC-MCP-0001 — Read own MCP connections

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open Account MCP connections.

**Expected results**

- Only own personal/browser connection metadata, endpoint and active limit appear.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2), [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83).

Browser-only HTTP operations: `listPersonalMcpTokens`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0002"></a>
### UC-MCP-0002 — Refresh connection list

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Refresh tokens.

**Expected results**

- Current own connection lifecycle/last-use metadata reloads.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2), [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83).

Browser-only HTTP operations: `listPersonalMcpTokens`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0003"></a>
### UC-MCP-0003 — Show empty connections state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open connections before any are created.

**Expected results**

- The page explains browser login and personal-token fallback.
- The signed-in account wire response has an empty own items array, its canonical MCP endpoint and active connection limit, and available browser OAuth client metadata.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2), [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83).

Browser-only HTTP operations: `listPersonalMcpTokens`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

Note: The browser explanatory copy remains required. The distinct existing REST surface now names its directly observable empty-own-list contract from mcptokens.Service.List; no page copy is inferred from an API seed.

<a id="uc-mcp-0004"></a>
### UC-MCP-0004 — Create personal credential

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Enter a valid nonblank connection name and generate token.

**Expected results**

- A named permanent credential is created and its secret is returned only in this creation response.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Browser-only HTTP operations: `createPersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0005"></a>
### UC-MCP-0005 — Reject blank token name

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Submit an empty or whitespace-only name.

**Expected results**

- The browser/server rejects the name.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Browser-only HTTP operations: `createPersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0006"></a>
### UC-MCP-0006 — Reject long token name

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Submit more than 80 supported characters.

**Expected results**

- Validation rejects the token name.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Browser-only HTTP operations: `createPersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0007"></a>
### UC-MCP-0007 — Preserve Arabic token name

Actor: `user` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Create a token named with Arabic or mixed-direction text.

**Expected results**

- The Unicode name is retained and rendered using automatic direction.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Browser-only HTTP operations: `createPersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0008"></a>
### UC-MCP-0008 — Mask newly revealed secret

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Create a personal token.

**Expected results**

- The secret input begins masked and creation focus moves to the reveal heading.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19), [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Browser-only HTTP operations: `createPersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0009"></a>
### UC-MCP-0009 — Show personal secret

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Show token before dismissing it.

**Expected results**

- The current creation secret becomes selectable visible text.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0010"></a>
### UC-MCP-0010 — Hide personal secret

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Hide token.

**Expected results**

- The input returns to password masking.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0011"></a>
### UC-MCP-0011 — Copy personal secret

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Copy token.

**Expected results**

- The exact current secret is copied and success feedback appears.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:104](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L104).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0012"></a>
### UC-MCP-0012 — Copy bearer client configuration

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Copy Antigravity config while token is revealed.

**Expected results**

- The endpoint and Authorization header configuration are copied.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:104](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L104), [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0013"></a>
### UC-MCP-0013 — Handle token clipboard denial

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Deny clipboard access then choose Copy token/config.

**Expected results**

- The UI explains using Show token and manual copy.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:104](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L104).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0014"></a>
### UC-MCP-0014 — Dismiss revealed credential

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Done on the reveal panel.

**Expected results**

- The page drops the secret and explains revoking/replacing it if lost.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19), [frontend/src/app/features/account/mcp-tokens.page.html:10](../../../frontend/src/app/features/account/mcp-tokens.page.html#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0015"></a>
### UC-MCP-0015 — Clear secret on navigation

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Navigate away or trigger pagehide after creation.

**Expected results**

- The component drops the secret rather than persisting it.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0016"></a>
### UC-MCP-0016 — Clear secret on account switch

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Switch session while a creation request or reveal is active.

**Expected results**

- Old secret, metadata and pending reply cannot populate the next account.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0017"></a>
### UC-MCP-0017 — Enforce active connection limit

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Create or approve another connection when ten personal/OAuth connections are active.

**Expected results**

- The service rejects the extra connection until another is revoked.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184).

Browser-only HTTP operations: `createPersonalMcpToken`, `decideMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0018"></a>
### UC-MCP-0018 — Serialize concurrent creation limit

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Create connections concurrently near the per-owner limit.

**Expected results**

- The owner guard keeps the combined active count within ten.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184).

Browser-only HTTP operations: `createPersonalMcpToken`, `decideMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0019"></a>
### UC-MCP-0019 — Recover lost creation response

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Refresh the connection list after a token was created but its secret response was lost.

**Expected results**

- The metadata may exist but the secret cannot be recovered; revoke the inaccessible credential and create a replacement.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83), [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Browser-only HTTP operations: `createPersonalMcpToken`, `listPersonalMcpTokens`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

Note: Personal-token creation has no business retry receipt for recovering the secret; do not document automatic exactly-once secret recovery.

<a id="uc-mcp-0020"></a>
### UC-MCP-0020 — Request revocation confirmation

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Revoke on an active connection.

**Expected results**

- Confirm revoke and Cancel controls appear before mutation.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0021"></a>
### UC-MCP-0021 — Cancel token revocation

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Cancel in the revocation prompt.

**Expected results**

- No revocation is sent and the connection remains active.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0022"></a>
### UC-MCP-0022 — Revoke own connection

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Confirm revocation of own active connection.

**Expected results**

- The list shows revoked and future access/refresh is unusable.

Sources: [backend/internal/features/mcptokens/service.go:141](../../../backend/internal/features/mcptokens/service.go#L141), [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Browser-only HTTP operations: `revokePersonalMcpToken`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0023"></a>
### UC-MCP-0023 — Deny foreign connection management

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Request another user token revoke/activity endpoint.

**Expected results**

- The foreign connection is unavailable, including to company administrators.

Sources: [backend/internal/features/mcptokens/service.go:141](../../../backend/internal/features/mcptokens/service.go#L141), [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31).

Browser-only HTTP operations: `revokePersonalMcpToken`, `listPersonalMcpTokenActivity`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0024"></a>
### UC-MCP-0024 — Hide stored credential secrets

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Read connection list after leaving the reveal page.

**Expected results**

- Only lifecycle metadata and prefix return; the full token cannot be fetched.

Sources: [backend/internal/features/mcptokens/service.go:83](../../../backend/internal/features/mcptokens/service.go#L83), [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104).

Browser-only HTTP operations: `listPersonalMcpTokens`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0025"></a>
### UC-MCP-0025 — Keep credential management browser-only

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Attempt creating/listing/revoking credentials using an assistant bearer identity.

**Expected results**

- Credential management is not exposed as an MCP tool and requires signed-in browser identity.

Sources: [backend/internal/features/mcptokens/service.go:104](../../../backend/internal/features/mcptokens/service.go#L104), [backend/internal/features/mcptokens/http.go:29](../../../backend/internal/features/mcptokens/http.go#L29).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0026"></a>
### UC-MCP-0026 — Authenticate personal MCP credential

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Call MCP with an active personal token.

**Expected results**

- The token resolves to its owning human and current company/project permissions.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24).

Shared business operations: `get_me`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0027"></a>
### UC-MCP-0027 — Reject malformed MCP credential

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use malformed token encoding/prefix/length.

**Expected results**

- Authentication is rejected without identifying account metadata.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0028"></a>
### UC-MCP-0028 — Reject revoked MCP credential

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use a revoked token.

**Expected results**

- The next authenticated request is rejected.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Note: Surface correction: this case invokes an MCP credential/tool and verifies its current revocation/owner/project access at /mcp. Personal credentials are never accepted at REST, so a REST 401 would only prove the separate audience boundary in UC-MCP-0031. No authorization behavior is removed. Sources: backend/internal/features/mcptokens/service.go Authenticate; backend/internal/platform/auth/session.go REST/MCP channel validation; identity/auth0/README.md Personal MCP tokens.

<a id="uc-mcp-0029"></a>
### UC-MCP-0029 — Reject disabled token owner

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Disable the owning account then invoke a tool.

**Expected results**

- Current owner status prevents access.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Note: Surface correction: this case invokes an MCP credential/tool and verifies its current revocation/owner/project access at /mcp. Personal credentials are never accepted at REST, so a REST 401 would only prove the separate audience boundary in UC-MCP-0031. No authorization behavior is removed. Sources: backend/internal/features/mcptokens/service.go Authenticate; backend/internal/platform/auth/session.go REST/MCP channel validation; identity/auth0/README.md Personal MCP tokens.

<a id="uc-mcp-0030"></a>
### UC-MCP-0030 — Enforce changed project permission

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Remove project access after a credential was issued.

**Expected results**

- The next project tool call enforces current membership.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Note: Surface correction: this case invokes an MCP credential/tool and verifies its current revocation/owner/project access at /mcp. Personal credentials are never accepted at REST, so a REST 401 would only prove the separate audience boundary in UC-MCP-0031. No authorization behavior is removed. Sources: backend/internal/features/mcptokens/service.go Authenticate; backend/internal/platform/auth/session.go REST/MCP channel validation; identity/auth0/README.md Personal MCP tokens.

<a id="uc-mcp-0031"></a>
### UC-MCP-0031 — Reject personal token at REST

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use a personal MCP token as REST bearer.

**Expected results**

- The credential cannot be used to bypass the browser audience boundary.

Sources: [backend/internal/features/mcptokens/service.go:157](../../../backend/internal/features/mcptokens/service.go#L157), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0032"></a>
### UC-MCP-0032 — Discover protected MCP resource

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Read protected-resource metadata.

**Expected results**

- The exact MCP resource, issuer, required scope and advertised website are returned.

Sources: [backend/internal/platform/mcpapi/server.go:49](../../../backend/internal/platform/mcpapi/server.go#L49).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0033"></a>
### UC-MCP-0033 — Initialize MCP client

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Connect using a supported MCP SDK/protocol.

**Expected results**

- The authenticated stateless transport initializes with tool capability.

Sources: [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0034"></a>
### UC-MCP-0034 — Page published tool catalog

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Read tools/list and follow its cursor.

**Expected results**

- All currently published tools and typed schemas can be discovered in bounded pages.

Sources: [backend/api/mcp-tools.json:1](../../../backend/api/mcp-tools.json#L1), [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Note: The checked registry currently contains 133 tools; master inventory owns the exact registry mapping.

<a id="uc-mcp-0035"></a>
### UC-MCP-0035 — Read typed tool result

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Invoke get_me using a current MCP identity.

**Expected results**

- Typed own-account/calendar content is returned.

Sources: [backend/api/mcp-tools.json:1](../../../backend/api/mcp-tools.json#L1), [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24).

Shared business operations: `get_me`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0036"></a>
### UC-MCP-0036 — Retain website resource link

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Invoke a business tool returning an issue or project.

**Expected results**

- A safe application link accompanies the appropriate returned resource.

Sources: [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24), [backend/api/mcp-tools.json:1](../../../backend/api/mcp-tools.json#L1).

Shared business operations: `get_project`, `get_issue_v2`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0037"></a>
### UC-MCP-0037 — Reject unauthenticated protocol request

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Call the protected MCP transport without acceptable bearer identity.

**Expected results**

- The request is challenged with resource metadata instead of serving private data.

Sources: [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0038"></a>
### UC-MCP-0038 — Reject invalid tool input

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Call a registered tool with schema-invalid input.

**Expected results**

- A structured protocol/business failure is returned.

Sources: [backend/internal/platform/mcpapi/server.go:24](../../../backend/internal/platform/mcpapi/server.go#L24), [backend/api/mcp-tools.json:1](../../../backend/api/mcp-tools.json#L1).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0039"></a>
### UC-MCP-0039 — Read OAuth discovery

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Read the advertised authorization-server metadata.

**Expected results**

- Authorization, token and revocation endpoints advertise public-client S256 code/refresh support.

Sources: [backend/internal/features/mcptokens/oauth.go:90](../../../backend/internal/features/mcptokens/oauth.go#L90).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0040"></a>
### UC-MCP-0040 — Copy browser proxy configuration

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Copy OAuth configuration.

**Expected results**

- Pinned proxy configuration includes the registered public client, resource and scope without a personal secret.

Sources: [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2), [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0041"></a>
### UC-MCP-0041 — Handle OAuth config clipboard denial

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Deny clipboard permission then copy OAuth configuration.

**Expected results**

- The page explains enabling clipboard access and retrying.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0042"></a>
### UC-MCP-0042 — Start valid browser authorization

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Send a valid registered-client authorization request with S256 challenge, state and resource.

**Expected results**

- A browser consent request is created and the app authorization route opens.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0043"></a>
### UC-MCP-0043 — Reject unregistered OAuth client

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use an unknown client_id.

**Expected results**

- Authorization returns invalid_request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0044"></a>
### UC-MCP-0044 — Reject wrong OAuth response type

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use a response_type other than code.

**Expected results**

- Authorization returns invalid_request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0045"></a>
### UC-MCP-0045 — Reject wrong OAuth scope

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Request a scope other than the registered access scope.

**Expected results**

- Authorization returns invalid_request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0046"></a>
### UC-MCP-0046 — Reject wrong OAuth resource

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Request a resource other than this exact MCP endpoint.

**Expected results**

- Authorization returns invalid_request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0047"></a>
### UC-MCP-0047 — Require PKCE S256

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Omit S256 or use an invalid challenge.

**Expected results**

- Authorization rejects the PKCE request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0048"></a>
### UC-MCP-0048 — Require OAuth state

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Omit state or exceed its bound.

**Expected results**

- Authorization rejects the request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0049"></a>
### UC-MCP-0049 — Reject unsafe OAuth callback

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use another host/path, credentials, query or fragment in callback.

**Expected results**

- Authorization rejects the redirect.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0050"></a>
### UC-MCP-0050 — Reject duplicate OAuth parameters

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Repeat a required authorization query key.

**Expected results**

- The request is rejected rather than selecting an ambiguous value.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0051"></a>
### UC-MCP-0051 — Bound authorization query size

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Send an authorization query over its request bound.

**Expected results**

- The service rejects the request.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0052"></a>
### UC-MCP-0052 — View consent details

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open a current pending consent while signed in.

**Expected results**

- Client name, acting account, callback and current-permission statement appear.

Sources: [backend/internal/features/mcptokens/oauth.go:169](../../../backend/internal/features/mcptokens/oauth.go#L169), [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32).

Browser-only HTTP operations: `getMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0053"></a>
### UC-MCP-0053 — Approve browser connection

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Approve connection.

**Expected results**

- A one-use code is issued and returned with original state and issuer.

Sources: [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184), [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32).

Browser-only HTTP operations: `decideMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0054"></a>
### UC-MCP-0054 — Deny browser connection

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Cancel connection.

**Expected results**

- The callback receives access_denied and no credential is issued.

Sources: [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184), [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32).

Browser-only HTTP operations: `decideMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0055"></a>
### UC-MCP-0055 — Reject invalid consent identifier

Actor: `user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open the app consent route with a malformed request value.

**Expected results**

- The page rejects the invalid connection request.

Sources: [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0056"></a>
### UC-MCP-0056 — Reject consumed or expired consent

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Read or decide an expired/already completed request.

**Expected results**

- The service asks to restart authorization from the client.

Sources: [backend/internal/features/mcptokens/oauth.go:169](../../../backend/internal/features/mcptokens/oauth.go#L169), [backend/internal/features/mcptokens/oauth.go:184](../../../backend/internal/features/mcptokens/oauth.go#L184).

Browser-only HTTP operations: `getMcpBrowserAuthorization`, `decideMcpBrowserAuthorization`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0057"></a>
### UC-MCP-0057 — Validate client return address

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. The consent decision returns a callback URL.

**Expected results**

- The page navigates only to supported IP loopback or registered Antigravity callback forms.

Sources: [frontend/src/app/features/account/mcp-authorize.page.ts:32](../../../frontend/src/app/features/account/mcp-authorize.page.ts#L32).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0058"></a>
### UC-MCP-0058 — Exchange authorization code

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Send code, matching verifier/client/resource/callback.

**Expected results**

- Short-lived access and rotating refresh credentials are issued without cacheable secret responses.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0059"></a>
### UC-MCP-0059 — Reject non-form token request

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Send JSON or token parameters in URL query.

**Expected results**

- The token endpoint returns invalid_request.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0060"></a>
### UC-MCP-0060 — Reject confidential-client authentication

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use Authorization/client_secret at the public-client token endpoint.

**Expected results**

- The endpoint returns invalid_client.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0061"></a>
### UC-MCP-0061 — Reject incorrect token target

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Exchange with wrong resource.

**Expected results**

- The endpoint returns invalid_target.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0062"></a>
### UC-MCP-0062 — Reject unsupported grant

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Request another grant_type.

**Expected results**

- The endpoint returns unsupported_grant_type.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0063"></a>
### UC-MCP-0063 — Reject wrong PKCE verifier

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Exchange code with mismatched verifier.

**Expected results**

- The endpoint rejects the grant.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0064"></a>
### UC-MCP-0064 — Reject consumed authorization code

Actor: `mcp_client` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Exchange a code already used.

**Expected results**

- Another credential cannot be obtained from that code.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0065"></a>
### UC-MCP-0065 — Serialize concurrent code exchange

Actor: `mcp_client` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Race two exchanges of the same authorization code.

**Expected results**

- At most one exchange can consume the code.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0066"></a>
### UC-MCP-0066 — Refresh OAuth connection

Actor: `mcp_client` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Exchange a valid refresh credential.

**Expected results**

- New access and refresh credentials rotate.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231), [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0067"></a>
### UC-MCP-0067 — Reject refresh scope escalation

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Refresh with unsupported or duplicate scope.

**Expected results**

- The endpoint rejects invalid_scope.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0068"></a>
### UC-MCP-0068 — Revoke replayed refresh connection

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Reuse a spent rotating refresh credential.

**Expected results**

- The replay is rejected and its associated connection is revoked.

Sources: [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0069"></a>
### UC-MCP-0069 — Preserve credential state after restart

Actor: `mcp_client` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `mcp`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Restart the service after a connection is established.

**Expected results**

- Valid persisted access/refresh state remains usable.

Sources: [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0070"></a>
### UC-MCP-0070 — Enforce access-token expiry

Actor: `mcp_client` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use an OAuth access credential after its 15-minute lifetime.

**Expected results**

- Access requires a valid refresh or a new authorization.

Sources: [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0071"></a>
### UC-MCP-0071 — Enforce absolute authorization expiry

Actor: `mcp_client` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use a refresh grant beyond its absolute 30-day window.

**Expected results**

- The client must sign in and approve again.

Sources: [identity/auth0/README.md:19](../../../identity/auth0/README.md#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0072"></a>
### UC-MCP-0072 — Revoke own OAuth credential

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Submit a known access/refresh credential to revocation.

**Expected results**

- Only its associated connection is revoked.

Sources: [backend/internal/features/mcptokens/oauth.go:335](../../../backend/internal/features/mcptokens/oauth.go#L335).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0073"></a>
### UC-MCP-0073 — Hide unknown revocation identity

Actor: `mcp_client` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Submit an unknown bounded credential to revocation.

**Expected results**

- The successful outcome does not disclose whether another account credential exists.

Sources: [backend/internal/features/mcptokens/oauth.go:335](../../../backend/internal/features/mcptokens/oauth.go#L335).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0074"></a>
### UC-MCP-0074 — Bound OAuth request rate

Actor: `mcp_client` · Kind: `performance` · Implementation: `implemented` · Surfaces: `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Exceed configured authorization/token/revoke rate.

**Expected results**

- The service returns temporarily_unavailable with rate-limit status.

Sources: [backend/internal/features/mcptokens/oauth.go:124](../../../backend/internal/features/mcptokens/oauth.go#L124), [backend/internal/features/mcptokens/oauth.go:231](../../../backend/internal/features/mcptokens/oauth.go#L231), [backend/internal/features/mcptokens/oauth.go:335](../../../backend/internal/features/mcptokens/oauth.go#L335).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0075"></a>
### UC-MCP-0075 — Require explicit shared OAuth deployment

Actor: `operator` · Kind: `permission` · Implementation: `external_pending` · Surfaces: `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Enable browser OAuth outside local development.

**Expected results**

- Verified OIDC identity, explicit enablement and canonical HTTPS API/browser origins are required.

Sources: [backend/internal/features/mcptokens/oauth.go:33](../../../backend/internal/features/mcptokens/oauth.go#L33), [integrations/antigravity/README.md:70](../../../integrations/antigravity/README.md#L70).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Gaps: [GAP-MCP-002](../gaps.md#gap-mcp-002).

<a id="uc-mcp-0076"></a>
### UC-MCP-0076 — Read connection activity

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose View activity on own current or revoked connection.

**Expected results**

- Tool name, start time, outcome, duration, error code and safe resource link appear.

Sources: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31), [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130).

Browser-only HTTP operations: `listPersonalMcpTokenActivity`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0077"></a>
### UC-MCP-0077 — Refresh connection activity

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Refresh activity.

**Expected results**

- Current calls for the selected connection reload.

Sources: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31), [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130).

Browser-only HTTP operations: `listPersonalMcpTokenActivity`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0078"></a>
### UC-MCP-0078 — Page older connection calls

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Load older activity.

**Expected results**

- The next owner-scoped 25-call page appends.

Sources: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31), [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130).

Browser-only HTTP operations: `listPersonalMcpTokenActivity`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0079"></a>
### UC-MCP-0079 — Close connection activity

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Close activity.

**Expected results**

- Selected log and pending generation clear.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0080"></a>
### UC-MCP-0080 — Record successful tool call

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `mcp`, `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use an authenticated connection to complete a business tool.

**Expected results**

- The durable attempt can show Succeeded with timing and link.

Sources: [backend/internal/features/mcptokens/activity.go:59](../../../backend/internal/features/mcptokens/activity.go#L59), [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31).

Shared business operations: `get_me`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0081"></a>
### UC-MCP-0081 — Record failed tool call

Actor: `mcp_client` · Kind: `failure` · Implementation: `implemented` · Surfaces: `mcp`, `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. A registered authenticated tool ends with a business failure.

**Expected results**

- Activity shows Failed and stable error code without request/response content.

Sources: [backend/internal/features/mcptokens/activity.go:59](../../../backend/internal/features/mcptokens/activity.go#L59), [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0082"></a>
### UC-MCP-0082 — Show unconfirmed call completion

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. A tool started but final recording is unavailable or still running.

**Expected results**

- The log shows Completion unconfirmed rather than asserting success.

Sources: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31), [frontend/src/app/features/account/mcp-tokens.page.html:2](../../../frontend/src/app/features/account/mcp-tokens.page.html#L2).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0083"></a>
### UC-MCP-0083 — Keep tool activity content private

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Inspect recorded activity for a call carrying file/content/credentials.

**Expected results**

- The activity projection excludes arguments, uploaded bytes, credentials and response bodies.

Sources: [backend/internal/features/mcptokens/activity.go:31](../../../backend/internal/features/mcptokens/activity.go#L31).

Browser-only HTTP operations: `listPersonalMcpTokenActivity`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-access-mcp-surfaces.spec.ts](../../../frontend/e2e/coverage-access-mcp-surfaces.spec.ts).

<a id="uc-mcp-0084"></a>
### UC-MCP-0084 — Discard obsolete connection log reply

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Switch selected connection or account while log request is delayed.

**Expected results**

- The stale reply cannot replace the new connection/account activity.

Sources: [frontend/src/app/features/account/mcp-tokens.page.ts:130](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L130), [frontend/src/app/features/account/mcp-tokens.page.ts:19](../../../frontend/src/app/features/account/mcp-tokens.page.ts#L19).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0085"></a>
### UC-MCP-0085 — Install native plugin by copying folder

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `external_pending` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Copy the public extracted plugin into a supported Antigravity plugins folder and reload.

**Expected results**

- The plugin panel and MCP bridge are discoverable without installing package dependencies.

Sources: [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Note: Supported installed-host copy/reload/discovery remains unverified: the real package and installed sidecar SDK can run in an isolated profile, but this harness does not operate the supported Antigravity host trust/reload/discovery UI. Preserve the original installation outcome and operator/plugin requirements until that host acceptance is executed. Source: integrations/antigravity/README.md Install on any device, Antigravity 1.1.28+ host requirements.

<a id="uc-mcp-0086"></a>
### UC-MCP-0086 — Preserve explicit panel preference

Actor: `plugin_user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Discover the plugin when panel preference is already disabled.

**Expected results**

- The disabled setting is retained rather than forcibly enabled.

Sources: [integrations/antigravity/src/panel-preference.ts:26](../../../integrations/antigravity/src/panel-preference.ts#L26), [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-native-boundaries.spec.ts](../../../frontend/e2e/coverage-native-boundaries.spec.ts).

<a id="uc-mcp-0087"></a>
### UC-MCP-0087 — Add only missing panel preference

Actor: `plugin_user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Start discovery without a GateGoldJira panel preference.

**Expected results**

- Only the missing preference is added with unrelated configuration/comments preserved.

Sources: [integrations/antigravity/src/panel-preference.ts:26](../../../integrations/antigravity/src/panel-preference.ts#L26), [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-native-boundaries.spec.ts](../../../frontend/e2e/coverage-native-boundaries.spec.ts).

<a id="uc-mcp-0088"></a>
### UC-MCP-0088 — Save plugin API server

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Enter a valid API server URL with optional /mcp suffix and save.

**Expected results**

- Server settings normalize and the website is discovered.

Sources: [integrations/antigravity/src/server-settings.ts:5](../../../integrations/antigravity/src/server-settings.ts#L5), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0089"></a>
### UC-MCP-0089 — Reject invalid plugin server address

Actor: `plugin_user` · Kind: `validation` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Save an unsafe or invalid API/website address.

**Expected results**

- An actionable validation error appears and no invalid connection is installed.

Sources: [integrations/antigravity/src/server-settings.ts:5](../../../integrations/antigravity/src/server-settings.ts#L5), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0090"></a>
### UC-MCP-0090 — Override legacy website URL

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Use Advanced website override for a server without discovery metadata.

**Expected results**

- Validated website settings permit safe application links.

Sources: [integrations/antigravity/src/server-settings.ts:5](../../../integrations/antigravity/src/server-settings.ts#L5), [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0091"></a>
### UC-MCP-0091 — Start plugin browser login

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Sign in with browser after server setup.

**Expected results**

- A pending OAuth flow opens with state, resource and S256 PKCE.

Sources: [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0092"></a>
### UC-MCP-0092 — Continue after blocked browser popup

Actor: `plugin_user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Block the popup then use Continue sign-in in your browser.

**Expected results**

- The validated pending authorization link remains available.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0093"></a>
### UC-MCP-0093 — Cancel plugin pending login

Actor: `plugin_user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Cancel during pending authorization.

**Expected results**

- The ephemeral callback closes and no credential is installed.

Sources: [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0094"></a>
### UC-MCP-0094 — Share plugin account between panel and tools

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`, `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Complete browser consent from native plugin.

**Expected results**

- The panel and MCP bridge use the same approved human connection.

Sources: [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48), [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0095"></a>
### UC-MCP-0095 — Reject unsafe plugin OAuth callback

Actor: `plugin_user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Receive mismatched state/issuer/resource/callback data.

**Expected results**

- The callback is rejected without installing the credential.

Sources: [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0096"></a>
### UC-MCP-0096 — Browse plugin projects

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open Projects in the connected panel.

**Expected results**

- Accessible project summaries and website links appear.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Shared business operations: `list_projects`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0097"></a>
### UC-MCP-0097 — Page plugin projects

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose More projects in the connected panel.

**Expected results**

- The next scoped page appends.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Shared business operations: `list_projects`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0098"></a>
### UC-MCP-0098 — Search plugin issues by submission

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Enter a query in the plugin Issues tab and submit.

**Expected results**

- Issue results load; this panel currently requires submit rather than live-as-you-type search.

Sources: [integrations/antigravity/src/ui.ts:154](../../../integrations/antigravity/src/ui.ts#L154), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42), [integrations/antigravity/src/mcp.ts:38](../../../integrations/antigravity/src/mcp.ts#L38), [integrations/antigravity/src/models.ts:47](../../../integrations/antigravity/src/models.ts#L47).

Shared business operations: `search_issues_v2`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [mcp-search.test.ts](../../../integrations/antigravity/tests/mcp-search.test.ts).

Gaps: [GAP-MCP-001](../gaps.md#gap-mcp-001), [GAP-MCP-003](../gaps.md#gap-mcp-003).

Note: The plugin query is a separate surface from the live web issue search.

<a id="uc-mcp-0099"></a>
### UC-MCP-0099 — Page plugin issues

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose More issues after a successful query.

**Expected results**

- The next result page appends within that query.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42), [integrations/antigravity/src/mcp.ts:38](../../../integrations/antigravity/src/mcp.ts#L38), [integrations/antigravity/src/models.ts:47](../../../integrations/antigravity/src/models.ts#L47).

Shared business operations: `search_issues_v2`.

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [mcp-search.test.ts](../../../integrations/antigravity/tests/mcp-search.test.ts).

Gaps: [GAP-MCP-003](../gaps.md#gap-mcp-003).

<a id="uc-mcp-0100"></a>
### UC-MCP-0100 — Open plugin website resource

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Follow a project or issue link in the panel.

**Expected results**

- The configured website resource opens with safe link isolation.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0101"></a>
### UC-MCP-0101 — Refresh plugin status

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Refresh the panel or return focus.

**Expected results**

- Connection status/account and accessible workspace refresh.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0102"></a>
### UC-MCP-0102 — Serialize plugin rotating refresh

Actor: `plugin_user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `plugin`, `mcp`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Panel and MCP bridge require refresh concurrently.

**Expected results**

- The shared private-store lock serializes rotation rather than replaying a spent refresh.

Sources: [integrations/antigravity/src/oauth.ts:149](../../../integrations/antigravity/src/oauth.ts#L149), [integrations/antigravity/src/store.ts:10](../../../integrations/antigravity/src/store.ts#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0103"></a>
### UC-MCP-0103 — Disconnect plugin connection

Actor: `plugin_user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Choose Disconnect while the server is reachable.

**Expected results**

- Server revocation completes before local credentials are deleted.

Sources: [integrations/antigravity/src/oauth.ts:199](../../../integrations/antigravity/src/oauth.ts#L199).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0104"></a>
### UC-MCP-0104 — Retain recoverable offline disconnect

Actor: `plugin_user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Disconnect while the service is unreachable.

**Expected results**

- The error retains local connection state for retry or website revocation.

Sources: [integrations/antigravity/src/oauth.ts:199](../../../integrations/antigravity/src/oauth.ts#L199), [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0105"></a>
### UC-MCP-0105 — Switch plugin account safely

Actor: `plugin_user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Disconnect then sign in with another account.

**Expected results**

- Old workspace rows and identity cannot leak into the new session.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42), [integrations/antigravity/src/oauth.ts:21](../../../integrations/antigravity/src/oauth.ts#L21).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0106"></a>
### UC-MCP-0106 — Lock server settings while connected

Actor: `plugin_user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Try editing server/website while credential or login is active.

**Expected results**

- Controls require disconnect/cancel before changing connection target.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0107"></a>
### UC-MCP-0107 — Preserve state during plugin upgrade

Actor: `plugin_user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Replace only the public plugin folder with a newer release.

**Expected results**

- Private settings and credentials remain in the separate user profile.

Sources: [integrations/antigravity/README.md:7](../../../integrations/antigravity/README.md#L7), [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-native-boundaries.spec.ts](../../../frontend/e2e/coverage-native-boundaries.spec.ts).

<a id="uc-mcp-0108"></a>
### UC-MCP-0108 — Keep credential material outside panel

Actor: `plugin_user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Inspect native panel messages/configuration output.

**Expected results**

- Bearer/refresh/password values are not sent into the panel or MCP configuration.

Sources: [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48), [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0109"></a>
### UC-MCP-0109 — Use separate private plugin profile

Actor: `operator` · Kind: `permission` · Implementation: `implemented` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Configure the documented separate private data-directory profile.

**Expected results**

- Settings and credentials are isolated from the default operating-system user profile.

Sources: [integrations/antigravity/README.md:48](../../../integrations/antigravity/README.md#L48), [integrations/antigravity/src/store.ts:10](../../../integrations/antigravity/src/store.ts#L10).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go), [coverage-native-boundaries.spec.ts](../../../frontend/e2e/coverage-native-boundaries.spec.ts).

<a id="uc-mcp-0110"></a>
### UC-MCP-0110 — Reject unsupported standalone panel context

Actor: `plugin_user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `plugin`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Open panel without the supported sidecar API.

**Expected results**

- The UI explains opening the panel in Antigravity.

Sources: [integrations/antigravity/src/ui.ts:42](../../../integrations/antigravity/src/ui.ts#L42).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

<a id="uc-mcp-0111"></a>
### UC-MCP-0111 — Document shared plugin deployment boundary

Actor: `operator` · Kind: `lifecycle` · Implementation: `external_pending` · Surfaces: `plugin`, `operator`

**Preconditions**

- The actor has the stated current approved account or client credential; local authorization uses isolated loopback development, and shared-provider cases explicitly remain pending.

**Steps**

1. Configure native plugin for a company shared server.

**Expected results**

- A reachable HTTPS API/site, real approved identity provider and explicit broker enablement remain required; copying plugin does not deploy cloud resources.

Sources: [integrations/antigravity/README.md:70](../../../integrations/antigravity/README.md#L70).

Related test files: [mcp-tokens.spec.ts](../../../frontend/e2e/mcp-tokens.spec.ts), [mcp-oauth.spec.ts](../../../frontend/e2e/mcp-oauth.spec.ts), [mcp-remote.spec.ts](../../../frontend/e2e/mcp-remote.spec.ts), [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp_oauth_test.go](../../../backend/tests/integration/mcp_oauth_test.go).

Gaps: [GAP-MCP-002](../gaps.md#gap-mcp-002).

<a id="uc-mcp-0112"></a>
### UC-MCP-0112 — Plugin issue search in a modern project

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`, `mcp`

**Preconditions**

- The plugin is connected and its account can read a modern-mode project.

**Steps**

1. Submit an issue query in the native plugin panel that uniquely matches work in the modern project.

**Expected results**

- The matching modern issue appears with its title, key and canonical stage display name.

Sources: [integrations/antigravity/src/mcp.ts:38](../../../integrations/antigravity/src/mcp.ts#L38), [integrations/antigravity/src/models.ts:47](../../../integrations/antigravity/src/models.ts#L47).

Shared business operations: `search_issues_v2`.

Related test files: [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp-search.test.ts](../../../integrations/antigravity/tests/mcp-search.test.ts).

Gaps: [GAP-MCP-003](../gaps.md#gap-mcp-003).

Note: Corrected on 2026-10-19: canonical search replaced the gated legacy client. Local real-sidecar acceptance and unit regressions cover the repair; real hosted identity/deployment acceptance remains separate.

<a id="uc-mcp-0113"></a>
### UC-MCP-0113 — Plugin issue search across mixed project modes

Actor: `plugin_user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `plugin`, `mcp`

**Preconditions**

- The plugin account can access legacy and modern projects and issue search is unscoped.

**Steps**

1. Submit a plugin issue query matching accessible legacy and modern project work, then append any remaining pages.

**Expected results**

- Matching work from both project modes is returned and displayed without silently dropping either mode.

Sources: [integrations/antigravity/src/mcp.ts:38](../../../integrations/antigravity/src/mcp.ts#L38), [integrations/antigravity/src/models.ts:47](../../../integrations/antigravity/src/models.ts#L47).

Shared business operations: `search_issues_v2`.

Related test files: [antigravity-plugin.spec.ts](../../../frontend/e2e/antigravity-plugin.spec.ts), [mcp-search.test.ts](../../../integrations/antigravity/tests/mcp-search.test.ts).

Gaps: [GAP-MCP-003](../gaps.md#gap-mcp-003).

Note: Corrected on 2026-10-19: native plugin search now uses the canonical typed result across modes. Local acceptance verified a mixed 28-issue result over two pages; this does not establish hosted-provider acceptance.
