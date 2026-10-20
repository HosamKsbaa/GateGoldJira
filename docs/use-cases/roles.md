# Actors and role boundaries

[Catalog index](README.md)

These definitions describe current shared-service authorization. Browser controls can be narrower; known differences are recorded in [gaps](gaps.md). They are source-inspected rules, not fresh runtime verification.

| Catalog actor | Meaning |
|---|---|
| `anonymous` | No approved, usable application session. |
| `user` | Active approved account performing a personal action; no project write access implied. |
| `reader` | Active approved account with current project read access: viewer, member, project administrator or company administrator. |
| `writer` | Active approved account allowed to edit work in the relevant active project: member, project administrator or company administrator. |
| `project_admin` | Membership role `project_admin` for the exact project. It does not confer company administration. |
| `company_admin` | Approved account with the company administrator flag; effective administrator access across company projects. |
| `author` | The comment's original author, who also needs current project write access to edit it. |
| `reviewer` | Current reviewer eligible under the selected transition's approval policy and reporter-exclusion rule. |
| `mcp_client` | A client acting as its authenticated human owner; not an independent privileged user. |
| `plugin_user` | The human using the Antigravity panel/bridge under their own connection. |
| `operator` | Authorized operator examining service health, maintenance, configuration or compatibility boundaries. |
| `worker` | Configured background processing that rechecks the recipients' current access and preferences. |

## Permission matrix

This matrix is a navigation aid. Each use case retains its specific conditions, including project archive state and current eligibility.

| Capability | Viewer | Member | Project administrator | Company administrator |
|---|---|---|---|---|
| Read accessible project work and protected published media | Yes | Yes | Yes | Yes |
| Create/edit issues, comments, relationships and planning in active project | No | Yes | Yes | Yes |
| Edit an existing comment | No | Own only | Own only | Own only |
| Be an issue assignee | No | Eligible | Eligible | Eligible |
| Be mentioned or selected in a custom person field | Eligible reader | Eligible | Eligible | Eligible |
| Watch issue and manage own inbox/preferences/saved searches | Yes | Yes | Yes | Yes |
| Configure project taxonomy, fields, workflows, policies and activation | No | No | Own project | Yes |
| Manage project memberships | No | No | Own active project | Yes, including permitted archived lifecycle operations |
| Edit project metadata through shared service | No | No | Own project; browser control mismatch recorded | Yes |
| Create/archive/restore projects | No | No | No | Yes |
| Approve/disable company accounts or manage company administrator flag | No | No | No | Yes |
| Read whole-company activity | No | No | No | Yes |
| Read another user's personal tokens or private inbox | No | No | No | No |
| Approve a transition | No | Policy-dependent | Policy-dependent | Policy-dependent |
| Read archived project work | When still authorized | When still authorized | When still authorized | Yes |
| Ordinary issue mutations inside archived project | No | No | No | No; restore project first |

Board management also depends on current board management capability and creator/project-admin rules. Reading a board does not automatically permit editing its layout.

## Rules that need independent cases

- Hidden browser controls are not the authorization boundary. Direct REST/MCP requests must observe current permissions.
- Removing approval, disabling an account, removing membership or archiving a project can change access after an editor was opened.
- `AllowArchived` does not grant project administrators an archived-project write exception. The shared transaction guard requires company administration for allowed archived lifecycle writes.
- An accepted retry result must be reauthorized before replay. A permanent personal MCP token does not freeze the owner's old roles.
- Current eligible project viewers can be mentioned and selected in custom person fields, but cannot be issue assignees.
- An administrator cannot edit someone else's comment or inspect another person's private connection secret through administrative privilege.
- Vote eligibility is checked independently from issue/workflow/configuration revision matching; a retained vote can cease counting after its author loses eligibility.
- Personal/OAuth connection management is a browser/account flow, not an assistant business tool that can mint its own credentials.

## Source map

- [Shared project authorization](../../backend/internal/platform/command/transaction.go#L162).
- [Role behavior](../../backend/internal/platform/command/types.go).
- [Browser route guards](../../frontend/src/app/core/auth/auth.guards.ts#L6).
- [Minimal assignee/mention candidate discovery](../../backend/internal/features/identity/reads.go#L115).
- [Membership mutations](../../backend/internal/features/identity/membership.go#L45).
- [Comment author checks](../../backend/internal/features/comments/service.go).
- [Approval eligibility](../../backend/internal/features/issues/approval_queries.sql).

Real Auth0/Google identity and hosted deployment acceptance remain separate from the local username/password adapter and local OAuth fixtures.
