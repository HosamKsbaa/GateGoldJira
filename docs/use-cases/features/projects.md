# Projects and project membership

Current project directory, lifecycle, read permissions, membership administration and eligible-person discovery. Workflow and board configuration have separate canonical areas.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `directory`: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55)
- `projectUi`: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606)
- `overview`: [frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts:31](../../../frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts#L31)
- `service`: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58)
- `create`: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91)
- `read`: [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39)
- `membershipUi`: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40)
- `membership`: [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45)
- `roleSave`: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97)
- `roleRemove`: [backend/internal/features/identity/membership.go:145](../../../backend/internal/features/identity/membership.go#L145)
- `candidate`: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121)
- `candidateSql`: [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66)
- `memberRead`: [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75)
- `memberCandidate`: [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163)
- `guard`: [frontend/src/app/core/auth/auth.guards.ts:31](../../../frontend/src/app/core/auth/auth.guards.ts#L31)
- `projectMcp`: [backend/internal/features/projects/mcp.go:43](../../../backend/internal/features/projects/mcp.go#L43)
- `membershipMcp`: [backend/internal/features/identity/mcp.go:55](../../../backend/internal/features/identity/mcp.go#L55)
- `transaction`: [backend/internal/platform/command/transaction.go:216](../../../backend/internal/platform/command/transaction.go#L216)

## Cases

<a id="uc-prj-0001"></a>
### UC-PRJ-0001 — List accessible projects

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open Projects while signed in.

**Expected results**

- Only accessible project metadata and the caller effective role are shown.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0002"></a>
### UC-PRJ-0002 — Read project overview

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open a current accessible project.

**Expected results**

- Its key, name, description, effective role and navigation links load.

Sources: [frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts:31](../../../frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts#L31).

Shared business operations: `get_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0066.

<a id="uc-prj-0003"></a>
### UC-PRJ-0003 — Search loaded project names

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Type a loaded project name into Find a project.

**Expected results**

- Loaded matching rows update without a search button.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: The current search is client-side over loaded rows.

<a id="uc-prj-0004"></a>
### UC-PRJ-0004 — Search loaded project keys

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Type a loaded project key.

**Expected results**

- Matching loaded project rows remain visible.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0005"></a>
### UC-PRJ-0005 — Explain limited directory search

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Search while further project pages remain unloaded.

**Expected results**

- The interface identifies matches as coming from loaded projects.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Gaps: [GAP-PRJ-003](../gaps.md#gap-prj-003).

<a id="uc-prj-0006"></a>
### UC-PRJ-0006 — Append project directory page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Choose More projects.

**Expected results**

- The next accessible bounded page is appended.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0067.

<a id="uc-prj-0007"></a>
### UC-PRJ-0007 — Include archived projects

Actor: `reader` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Enable Include archived projects.

**Expected results**

- Accessible archived projects join the directory with read-only status.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0008"></a>
### UC-PRJ-0008 — Exclude archived projects

Actor: `reader` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Turn Include archived projects off.

**Expected results**

- Archived rows are omitted from the current directory list.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0009"></a>
### UC-PRJ-0009 — Reload project directory

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Choose Refresh projects.

**Expected results**

- The list reloads with busy/error feedback rather than retaining an unsupported success message.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0010"></a>
### UC-PRJ-0010 — Show empty project directory

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open a directory with no accessible matching project.

**Expected results**

- A clear no-projects or no-matches message is shown.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0011"></a>
### UC-PRJ-0011 — Create project

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit a valid project key, name and description.

**Expected results**

- The project and default All Issues board are created with the chosen metadata.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0012"></a>
### UC-PRJ-0012 — Normalize project key

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Create using lowercase letters in an otherwise valid project key.

**Expected results**

- The persisted project key is uppercase.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Review correction: the shared service trims keys, but the published REST/MCP schema rejects surrounding whitespace before service normalization. Whitespace rejection is tracked independently in UC-PRJ-0064.

<a id="uc-prj-0013"></a>
### UC-PRJ-0013 — Reject malformed project key

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit a key outside 2–10 alphanumeric characters starting with a letter.

**Expected results**

- Project creation is rejected.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0014"></a>
### UC-PRJ-0014 — Reject duplicate project key

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Create another project using an existing normalized key.

**Expected results**

- The second project is rejected without a duplicate key.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0015"></a>
### UC-PRJ-0015 — Require project name

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit an empty or whitespace-only project name.

**Expected results**

- Creation or edit is rejected.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`, `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0016"></a>
### UC-PRJ-0016 — Bound project name

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit more than 100 Unicode characters as the name.

**Expected results**

- The change is rejected.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`, `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0017"></a>
### UC-PRJ-0017 — Bound project description

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit more than 2000 characters as description.

**Expected results**

- The project change is rejected.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`, `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0018"></a>
### UC-PRJ-0018 — Preserve Arabic project metadata

Actor: `company_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Create or edit Arabic name and description.

**Expected results**

- Text remains intact and displays with automatic direction.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `create_project`, `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0065.

<a id="uc-prj-0019"></a>
### UC-PRJ-0019 — Keep newly created project reachable

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Create a project whose directory order is beyond the first page.

**Expected results**

- The created project remains reachable through the post-create directory handling.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0020"></a>
### UC-PRJ-0020 — Open create-issue action

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open an active project as a writer and choose Create issue.

**Expected results**

- Issue creation opens scoped to that project.

Sources: [frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts:31](../../../frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts#L31).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0021"></a>
### UC-PRJ-0021 — Hide create action for viewer

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open the same overview as a viewer.

**Expected results**

- The create action is absent and the project remains readable.

Sources: [frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts:31](../../../frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts#L31).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0022"></a>
### UC-PRJ-0022 — Edit project name

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save a changed project name at its current revision.

**Expected results**

- The project name updates while its key remains unchanged.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0023"></a>
### UC-PRJ-0023 — Edit project description

Actor: `company_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save a changed project description.

**Expected results**

- The plain-text description updates without changing project identity.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0024"></a>
### UC-PRJ-0024 — Retain immutable project key

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open an existing project edit form.

**Expected results**

- The key is retained and cannot be renamed through the edit body.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606), [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0069.

<a id="uc-prj-0025"></a>
### UC-PRJ-0025 — Update metadata as project administrator

Actor: `project_admin` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Call update_project with current scope as project administrator.

**Expected results**

- The shared service and published MCP description permit current company Administrator or project Configure access; the project directory edit affordance remains company-administrator-only.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [backend/internal/features/projects/mcp.go:43](../../../backend/internal/features/projects/mcp.go#L43).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access.spec.ts](../../../frontend/e2e/coverage-access.spec.ts).

Gaps: [GAP-PRJ-001](../gaps.md#gap-prj-001).

Note: The stale Administrator-only MCP description was corrected on 2026-10-19. REST and actual MCP project-administrator writes are verified separately; browser directory affordance remains a documented difference.

<a id="uc-prj-0026"></a>
### UC-PRJ-0026 — Deny project creation to ordinary user

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Attempt create_project as member or viewer.

**Expected results**

- Company administrator permission is required.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0027"></a>
### UC-PRJ-0027 — Archive project

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Archive a current active project.

**Expected results**

- Work and settings are retained and normal project writes become read-only.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `archive_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0028"></a>
### UC-PRJ-0028 — Restore project

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Restore an archived project.

**Expected results**

- Retained content and memberships become usable again.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `restore_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0029"></a>
### UC-PRJ-0029 — Repeat archive safely

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Archive an already archived project with current revision.

**Expected results**

- The unchanged state is returned without another semantic change.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `archive_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0030"></a>
### UC-PRJ-0030 — Repeat restore safely

Actor: `company_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Restore an already active project with current revision.

**Expected results**

- The unchanged state is returned.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `restore_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0031"></a>
### UC-PRJ-0031 — Deny lifecycle controls to project administrator

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Attempt archive or restore without company administrator status.

**Expected results**

- The command is denied even for a project administrator.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `archive_project`, `restore_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0032"></a>
### UC-PRJ-0032 — Review project conflict

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save a stale project revision and review current values.

**Expected results**

- The current project is shown before another intentional edit.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0070.

<a id="uc-prj-0033"></a>
### UC-PRJ-0033 — Retry uncertain project change

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Repeat a project mutation with its original body and retry reference.

**Expected results**

- A previously accepted mutation is not duplicated.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `create_project`, `update_project`, `archive_project`, `restore_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0034"></a>
### UC-PRJ-0034 — Handle inaccessible project

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request an unknown or inaccessible project ID.

**Expected results**

- An unavailable result does not expose its metadata.

Sources: [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `get_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0035"></a>
### UC-PRJ-0035 — List project memberships

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Open Project access as authorized project administrator.

**Expected results**

- Names, roles and membership revisions load for that project.

Sources: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40), [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75).

Shared business operations: `list_memberships`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go), [coverage-access.spec.ts](../../../frontend/e2e/coverage-access.spec.ts).

Gaps: [GAP-PRJ-004](../gaps.md#gap-prj-004).

Note: The published MCP description now names current Configure access. REST and actual MCP project-administrator reads are verified separately.

<a id="uc-prj-0036"></a>
### UC-PRJ-0036 — Page project memberships

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request another membership page.

**Expected results**

- The next bounded membership page is returned.

Sources: [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `list_memberships`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0037"></a>
### UC-PRJ-0037 — Read removed membership history

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request list_memberships with includeRemoved enabled.

**Expected results**

- Retained removed memberships are included without restoring access.

Sources: [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75).

Shared business operations: `list_memberships`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0038"></a>
### UC-PRJ-0038 — Read membership candidates

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Load approved people for project role assignment.

**Expected results**

- Only minimal names, IDs and active flags appear; global account emails are not exposed.

Sources: [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0039"></a>
### UC-PRJ-0039 — Page membership candidates

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Choose More approved users.

**Expected results**

- Further bounded approved-user candidates load.

Sources: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40), [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163).

Shared business operations: `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0068.

<a id="uc-prj-0040"></a>
### UC-PRJ-0040 — Search membership candidates

Actor: `project_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request a candidate query by Arabic or mixed-language display name.

**Expected results**

- Matching minimal approved directory summaries are returned.

Sources: [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163).

Shared business operations: `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0041"></a>
### UC-PRJ-0041 — Grant member role

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Choose an approved user and save Member.

**Expected results**

- The user gains write access in this project.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0042"></a>
### UC-PRJ-0042 — Grant viewer role

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save Viewer for an approved user.

**Expected results**

- The user gains read-only project access.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0043"></a>
### UC-PRJ-0043 — Grant project administrator role

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save Project admin for an approved user.

**Expected results**

- Project configuration and membership permissions are granted without company administration.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0044"></a>
### UC-PRJ-0044 — Change existing membership

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save a different role using the current retained revision.

**Expected results**

- The same membership receives the new role and revision.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0045"></a>
### UC-PRJ-0045 — Remove project access

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Remove a current membership.

**Expected results**

- Access ends and assignments no longer eligible under any current role are cleared.

Sources: [backend/internal/features/identity/membership.go:145](../../../backend/internal/features/identity/membership.go#L145), [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45).

Shared business operations: `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0046"></a>
### UC-PRJ-0046 — Restore removed membership

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save a role for a removed membership with its current revision.

**Expected results**

- The retained membership becomes active rather than creating a second membership.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0047"></a>
### UC-PRJ-0047 — Repeat unchanged membership

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save the same active role at the current revision.

**Expected results**

- The current membership is returned as a no-op.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0048"></a>
### UC-PRJ-0048 — Review membership conflict

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save using an outdated membership revision and choose Review current membership.

**Expected results**

- Current role/removal state appears and the form requires explicit review.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Surface correction: browser interaction assertions remain on this stable ID. The distinct service contract is tracked by UC-PRJ-0071.

<a id="uc-prj-0049"></a>
### UC-PRJ-0049 — Retry uncertain membership mutation

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Repeat original membership save/removal intent and retry reference.

**Expected results**

- The original result is retained without duplicate changes.

Sources: [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0050"></a>
### UC-PRJ-0050 — Deny unrelated project administration

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request memberships or mutate roles in another inaccessible project.

**Expected results**

- No memberships or role updates are exposed.

Sources: [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45), [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75).

Shared business operations: `list_memberships`, `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0051"></a>
### UC-PRJ-0051 — Deny membership directory to viewer

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request memberships or approved candidates as viewer.

**Expected results**

- Project Configure permission is required.

Sources: [backend/internal/features/identity/reads.go:75](../../../backend/internal/features/identity/reads.go#L75), [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163).

Shared business operations: `list_memberships`, `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0052"></a>
### UC-PRJ-0052 — Reject invalid membership role

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit an unsupported role or missing/nonzero-invalid user/project identity.

**Expected results**

- Validation rejects the grant.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97).

Shared business operations: `set_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0053"></a>
### UC-PRJ-0053 — Keep membership editor project-scoped

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Switch from one membership route to another project.

**Expected results**

- The new route loads its own people, revisions and draft state.

Sources: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0054"></a>
### UC-PRJ-0054 — Select another membership target

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Choose another approved user in the role form.

**Expected results**

- The selected membership revision and retry state update to that user.

Sources: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0055"></a>
### UC-PRJ-0055 — Manage archived memberships as company administrator

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save/remove memberships on an archived project as authorized administrator.

**Expected results**

- The company administrator can change or remove retained archived-project memberships through the lifecycle-safe service.

Sources: [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45), [backend/internal/platform/command/transaction.go:216](../../../backend/internal/platform/command/transaction.go#L216).

Shared business operations: `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: AllowArchived permits archived writes only when the current actor is a company administrator; project administrators remain denied.

<a id="uc-prj-0056"></a>
### UC-PRJ-0056 — List eligible assignees

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request list_assignees for an accessible project.

**Expected results**

- Active approved company administrators and project writers appear as minimal name/ID summaries.

Sources: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121), [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66).

Shared business operations: `list_assignees`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0057"></a>
### UC-PRJ-0057 — Exclude viewer from assignees

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request assignee candidates when an approved person has only Viewer membership.

**Expected results**

- That person is absent from assignment candidates unless globally eligible as company administrator.

Sources: [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66).

Shared business operations: `list_assignees`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0058"></a>
### UC-PRJ-0058 — List eligible mention readers

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Request list_mention_candidates.

**Expected results**

- Active approved project readers including viewers can be selected for mentions.

Sources: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121), [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66).

Shared business operations: `list_mention_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0059"></a>
### UC-PRJ-0059 — Exclude inactive people from candidates

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Search assignee or mention candidates for a disabled or removed person without other eligibility.

**Expected results**

- That person is excluded from eligible candidate results.

Sources: [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66).

Shared business operations: `list_assignees`, `list_mention_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0060"></a>
### UC-PRJ-0060 — Search eligible person names

Actor: `reader` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Search candidate summaries using Arabic or mixed-language display text.

**Expected results**

- Matching names are returned without exposing email search or unrelated account details.

Sources: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121), [backend/internal/features/identity/queries.sql:66](../../../backend/internal/features/identity/queries.sql#L66).

Shared business operations: `list_assignees`, `list_mention_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0061"></a>
### UC-PRJ-0061 — Page eligible people

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Follow the scoped assignee or mention cursor.

**Expected results**

- Bounded candidate pages preserve scope and order.

Sources: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121).

Shared business operations: `list_assignees`, `list_mention_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0062"></a>
### UC-PRJ-0062 — Bound people query

Actor: `reader` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit over 100 characters in a people query.

**Expected results**

- The service rejects the query.

Sources: [backend/internal/features/identity/reads.go:121](../../../backend/internal/features/identity/reads.go#L121), [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163).

Shared business operations: `list_assignees`, `list_mention_candidates`, `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

<a id="uc-prj-0063"></a>
### UC-PRJ-0063 — Deny archived membership writes to project administrator

Actor: `project_admin` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is a project administrator without company administrator status in an archived project.

**Steps**

1. Attempt to save or remove a membership through the API or MCP.

**Expected results**

- The shared transaction guard returns Archived projects are read-only; AllowArchived alone does not permit this actor to write.

Sources: [backend/internal/features/identity/membership.go:45](../../../backend/internal/features/identity/membership.go#L45), [backend/internal/platform/command/transaction.go:216](../../../backend/internal/platform/command/transaction.go#L216), [frontend/src/app/core/auth/auth.guards.ts:31](../../../frontend/src/app/core/auth/auth.guards.ts#L31).

Shared business operations: `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts).

Note: This is a confirmed permission boundary, not a browser/backend permission mismatch.

<a id="uc-prj-0064"></a>
### UC-PRJ-0064 — Reject surrounding project-key whitespace at the public contract

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit a project key with leading or trailing whitespace through REST or MCP.

**Expected results**

- The published key pattern rejects the request; no project is created.

Sources: [backend/internal/features/projects/service.go:91](../../../backend/internal/features/projects/service.go#L91).

Shared business operations: `create_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Source review and isolated Playwright integration confirmed that public schema validation runs before service trimming.

<a id="uc-prj-0065"></a>
### UC-PRJ-0065 — Preserve Arabic project text through service contracts

Actor: `company_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Create or edit an Arabic project name and description.

**Expected results**

- Typed saved metadata and a subsequent project read preserve both exact strings.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `create_project`, `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0018; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0066"></a>
### UC-PRJ-0066 — Read current project metadata

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Read get_project for a currently accessible project.

**Expected results**

- The typed result returns its current key, name, description and caller effective role.

Sources: [frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts:31](../../../frontend/src/app/features/projects/pages/project-overview/project-overview.page.ts#L31).

Shared business operations: `get_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0002; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0067"></a>
### UC-PRJ-0067 — Page accessible project metadata

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Read list_projects with a bounded limit, then continue using its next cursor.

**Expected results**

- Pages retain the same filtered total, do not repeat returned records and expose only accessible project metadata.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:55](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L55), [backend/internal/features/projects/reads.go:39](../../../backend/internal/features/projects/reads.go#L39).

Shared business operations: `list_projects`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0006; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0068"></a>
### UC-PRJ-0068 — Page approved membership candidates

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Read list_membership_candidates using a bounded limit and then its next cursor.

**Expected results**

- Further eligible approved candidates are returned without repeated records.

Sources: [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40), [backend/internal/features/identity/reads.go:163](../../../backend/internal/features/identity/reads.go#L163).

Shared business operations: `list_membership_candidates`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0039; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0069"></a>
### UC-PRJ-0069 — Keep project key immutable through update contracts

Actor: `company_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Update existing project metadata; attempt a key property that is absent from the published update schema.

**Expected results**

- Accepted metadata changes retain the project key and an update body containing a replacement key is rejected.

Sources: [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606), [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0024; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0070"></a>
### UC-PRJ-0070 — Return current project in a stale-write conflict

Actor: `company_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Submit an outdated project revision.

**Expected results**

- A typed conflict returns current metadata and the stale change does not overwrite it.

Sources: [backend/internal/features/projects/service.go:58](../../../backend/internal/features/projects/service.go#L58), [frontend/src/app/features/projects/pages/project-list/project-list.page.ts:606](../../../frontend/src/app/features/projects/pages/project-list/project-list.page.ts#L606).

Shared business operations: `update_project`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0032; it does not claim browser rendering, form state, session epochs or download assembly.

<a id="uc-prj-0071"></a>
### UC-PRJ-0071 — Return current membership in a stale-write conflict

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is an active approved account with the role stated in the case; project-scoped cases have a current accessible project unless the denial scenario says otherwise.

**Steps**

1. Save or remove access using an outdated membership revision.

**Expected results**

- A typed conflict returns current role and removal state; the stale intent does not overwrite it.

Sources: [backend/internal/features/identity/membership.go:97](../../../backend/internal/features/identity/membership.go#L97), [frontend/src/app/features/administration/pages/memberships/memberships.page.ts:40](../../../frontend/src/app/features/administration/pages/memberships/memberships.page.ts#L40).

Shared business operations: `set_membership`, `remove_membership`.

Related test files: [projects.spec.ts](../../../frontend/e2e/projects.spec.ts), [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [service_test.go](../../../backend/internal/features/identity/service_test.go).

Note: Atomic service counterpart split from UC-PRJ-0048; it does not claim browser rendering, form state, session epochs or download assembly.
