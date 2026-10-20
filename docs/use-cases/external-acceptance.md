# External acceptance still pending

Catalog baseline: **2026-10-20**. These **13 cases remain `external_pending`** in the [catalog](catalog.json). This checklist records the missing acceptance evidence; it does not claim an external run has passed.

The catalog has **1,772 cases**. Its **1,759 locally eligible outcomes include 11 unavailable-feature boundaries**, such as rejecting an unsupported action or exposing no such control. Passing those boundaries does not implement the unavailable features. Local outcome counts, coverage on every declared interface and source-code coverage are separate measurements; see the [test strategy](test-strategy.json).

Actual provider and installed-host acceptance remains separate from local SDK, fake-verifier, SMTP-sink and packaged-sidecar tests. Execute each pending journey against an authorized isolated target and retain evidence for every interface declared in its case.

| Case | Exact catalog title | Required target | Pending observable proof |
|---|---|---|---|
| [UC-ACC-0032](features/access.md#uc-acc-0032) | Offer managed Google sign-in | Configured Auth0 tenant and Google connection | In managed identity mode, select Continue with Google and observe the actual configured provider redirect. |
| [UC-ACC-0033](features/access.md#uc-acc-0033) | Refresh managed browser token | Real managed browser session | After renewal becomes necessary, verify the SDK obtains a token for the configured REST audience and required scope, and the protected request succeeds. |
| [UC-ACC-0034](features/access.md#uc-acc-0034) | Log out managed identity | Real managed browser session | Sign out through the actual provider and verify return to the configured application origin. |
| [UC-ACC-0058](features/access.md#uc-acc-0058) | Explain invitation boundary | Managed employee identity and company administrator | Approve the account through each declared interface; verify the workspace URL is shared separately and approval does not send an invitation email. |
| [UC-MCP-0075](features/mcp.md#uc-mcp-0075) | Require explicit shared OAuth deployment | Shared HTTPS API/site and real OIDC provider | Verify browser OAuth outside local development requires verified OIDC identity, explicit enablement and the canonical HTTPS API/browser origins. |
| [UC-MCP-0085](features/mcp.md#uc-mcp-0085) | Install native plugin by copying folder | Supported installed Antigravity host | Copy the public extracted plugin into the supported plugins folder, reload the actual host and verify panel/bridge discovery without installing package dependencies. |
| [UC-MCP-0111](features/mcp.md#uc-mcp-0111) | Document shared plugin deployment boundary | Installed plugin connected to the company shared target | Verify the reachable HTTPS API/site, approved real identity provider and explicit broker enablement are required; copying the plugin alone does not deploy cloud resources. |
| [UC-NTF-0065](features/notifications.md#uc-ntf-0065) | Deliver instant email | Intended SMTP service and test recipient | Process an eligible instant update and verify actual receipt containing the current issue key/title, safe summary and authenticated website link. |
| [UC-NTF-0066](features/notifications.md#uc-ntf-0066) | Deliver bounded daily digest | Intended SMTP service and hosted scheduler | Process due daily deliveries through the configured scheduler and verify receipt grouping at most 50 eligible updates with current issue links. |
| [UC-SYS-0028](features/platform.md#uc-sys-0028) | Maintenance service identity | Configured endpoint and allowed Google service-account identity | With a real verified token and empty body, verify the bounded maintenance operation executes and its response is no-store. |
| [UC-SYS-0030](features/platform.md#uc-sys-0030) | Maintenance wrong identity | Configured endpoint and an unapproved Google service identity | Verify a real unapproved identity is denied before maintenance executes. |
| [UC-SYS-0031](features/platform.md#uc-sys-0031) | Maintenance wrong audience | Configured endpoint and real token for a different audience | Verify authentication fails for the configured maintenance audience. |
| [UC-SYS-0032](features/platform.md#uc-sys-0032) | Maintenance unexpected body | Configured endpoint and allowed verified Google identity | Send a positive Content-Length body and verify HTTP 400 instead of accepting caller-controlled input. |

For each run, record case ID, exercised interface, source/build hashes, target configuration identifiers, host/provider versions where relevant, timestamp and redacted observable results. Keep credentials, tokens, recipient addresses, raw messages and private logs in the private evidence store; public reports should link only sanitized evidence. Use the configured credential mechanisms rather than placing secrets in this document or chat.

Setup references: [managed identity](../../identity/auth0/README.md), [MCP onboarding](../mcp-onboarding.md), [native plugin installation and shared deployment](../../integrations/antigravity/README.md), and [isolated target preparation](../../specs/001-gategoldjira-mvp/validation/test-target.md).

These 13 catalog cases are not the complete production-readiness checklist. [Readiness gates](../../specs/002-scalable-core/validation/readiness.md) separately retain real GCS/IAM transfers, hosted latency and idle-start behavior, deployment/billing configuration and an external paired database/object restore. Local acceptance does not establish those outcomes. SMTP delivery also retains its documented [at-least-once boundary](gaps.md#gap-ntf-002).
