# Compatibility clients and retained data

Published V1 issue/board/media operations remain a distinct API/MCP surface. Current native web routes use V2 where available; compatibility projection is not permission to rewrite custom identities.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `issues`: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8)
- `search`: [backend/internal/features/issues/search.go:1](../../../backend/internal/features/issues/search.go#L1)
- `boards`: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1)
- `pictures`: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1)
- `attachments`: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1)
- `boundary`: [specs/002-scalable-core/validation/native-client-boundary.md:1](../../../specs/002-scalable-core/validation/native-client-boundary.md#L1)
- `receipts`: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1)

## Cases

<a id="uc-cmp-0001"></a>
### UC-CMP-0001 — Read V1 issue projection

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current read access and all projects in the requested scope are compatible legacy-mode projects.

**Steps**

1. Read an authorized issue through get_issue.

**Expected results**

- The retained V1 representation is returned; it is not the native typed-choice editor contract.

Sources: [backend/internal/features/issues/search.go:1](../../../backend/internal/features/issues/search.go#L1).

Shared business operations: `get_issue`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0002"></a>
### UC-CMP-0002 — Search V1 issues

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current read access and all projects in the requested scope are compatible legacy-mode projects.

**Steps**

1. Search authorized work through search_issues.

**Expected results**

- The V1 bounded authorized result surface remains published.

Sources: [backend/internal/features/issues/search.go:1](../../../backend/internal/features/issues/search.go#L1).

Shared business operations: `search_issues`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0003"></a>
### UC-CMP-0003 — Create through V1 on compatible project

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Create a legacy-representable issue while the project remains in legacy mode.

**Expected results**

- The compatibility creation contract applies its legacy choices and preserves attribution.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `create_issue`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0004"></a>
### UC-CMP-0004 — Reject new V1 full edit on modern project

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Attempt a fresh V1 full issue edit after modern-mode activation.

**Expected results**

- Client-version validation directs the caller to V2 rather than rewriting custom identities.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `update_issue`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0005"></a>
### UC-CMP-0005 — Reject new V1 field patch on modern project

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Attempt a fresh V1 selected-field patch after modern-mode activation.

**Expected results**

- The compatibility gate prevents a new incompatible mutation.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `patch_issue_field`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0006"></a>
### UC-CMP-0006 — Reject new V1 movement on modern project

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Attempt a fresh legacy issue movement after modern-mode activation.

**Expected results**

- The compatibility gate directs movement to the native workflow contract.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `move_issue`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0007"></a>
### UC-CMP-0007 — Retain legacy shared-order surface

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Use the published legacy reorder operation in its supported compatibility context.

**Expected results**

- The legacy shared-order contract remains distinct from independent V2 board ranks.

Sources: [specs/002-scalable-core/validation/native-client-boundary.md:1](../../../specs/002-scalable-core/validation/native-client-boundary.md#L1).

Shared business operations: `reorder_issue`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0008"></a>
### UC-CMP-0008 — Retain V1 board creation contract

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Create a board through the published V1 board operation in a compatible project.

**Expected results**

- The legacy operation is distinct from create_board_v2 and does not become the native UI by implication.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `create_board`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0009"></a>
### UC-CMP-0009 — Read V1 board projection

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current read access and all projects in the requested scope are compatible legacy-mode projects.

**Steps**

1. Read an authorized board through get_board.

**Expected results**

- The retained status-token column/count projection is returned; independent native column identities are a different contract.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `get_board`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0010"></a>
### UC-CMP-0010 — Page V1 board cards

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current read access and all projects in the requested scope are compatible legacy-mode projects.

**Steps**

1. Read a supported legacy column through list_board_cards.

**Expected results**

- Bounded V1 cards use their retained status/order contract and scoped cursors.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `list_board_cards`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0011"></a>
### UC-CMP-0011 — Retain V1 board settings boundary

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and an explicitly identified compatibility or modern project state.

**Steps**

1. Attempt legacy board-settings update in the current project mode.

**Expected results**

- Supported legacy edits obey the mode gate; richer native layouts are not silently round-tripped through an older editor.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `update_board`.

Note: Compatibility-surface case; do not infer a native browser control or full custom-choice support from this published operation.

<a id="uc-cmp-0012"></a>
### UC-CMP-0012 — Compatibility list_pictures

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke list_pictures in its currently supported authorized context.

**Expected results**

- The published adapter provides current gallery plus permitted own draft discovery; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1).

Shared business operations: `list_pictures`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0013"></a>
### UC-CMP-0013 — Compatibility get_picture

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke get_picture in its currently supported authorized context.

**Expected results**

- The published adapter provides authorized picture metadata; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1).

Shared business operations: `get_picture`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0014"></a>
### UC-CMP-0014 — Compatibility download_picture

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke download_picture in its currently supported authorized context.

**Expected results**

- The published adapter provides authorized whole-picture base64 download; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1).

Shared business operations: `download_picture`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0015"></a>
### UC-CMP-0015 — Compatibility upload_picture

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke upload_picture in its currently supported authorized context.

**Expected results**

- The published adapter provides validated PNG/JPEG/WebP upload under the legacy 10 MiB boundary; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1).

Shared business operations: `upload_picture`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0016"></a>
### UC-CMP-0016 — Compatibility detach_gallery_picture

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke detach_gallery_picture in its currently supported authorized context.

**Expected results**

- The published adapter provides gallery detachment while retained references survive; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/pictures/service.go:1](../../../backend/internal/features/pictures/service.go#L1).

Shared business operations: `detach_gallery_picture`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0017"></a>
### UC-CMP-0017 — Compatibility list_attachments

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke list_attachments in its currently supported authorized context.

**Expected results**

- The published adapter provides attached legacy document discovery; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1).

Shared business operations: `list_attachments`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0018"></a>
### UC-CMP-0018 — Compatibility get_attachment

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke get_attachment in its currently supported authorized context.

**Expected results**

- The published adapter provides authorized legacy attachment metadata; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1).

Shared business operations: `get_attachment`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0019"></a>
### UC-CMP-0019 — Compatibility download_attachment

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke download_attachment in its currently supported authorized context.

**Expected results**

- The published adapter provides authorized whole-document base64 download; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1).

Shared business operations: `download_attachment`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0020"></a>
### UC-CMP-0020 — Compatibility upload_attachment

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke upload_attachment in its currently supported authorized context.

**Expected results**

- The published adapter provides validated legacy supported document upload under its 10 MiB boundary; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1).

Shared business operations: `upload_attachment`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0021"></a>
### UC-CMP-0021 — Compatibility detach_attachment

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Invoke detach_attachment in its currently supported authorized context.

**Expected results**

- The published adapter provides document detachment while retained bytes/references survive; canonical general-file/resumable operations remain a separate contract.

Sources: [backend/internal/features/attachments/service.go:1](../../../backend/internal/features/attachments/service.go#L1).

Shared business operations: `detach_attachment`.

Note: Current native attachment UI uses unified assets; legacy MIME/size/visibility constraints must be checked independently.

<a id="uc-cmp-0022"></a>
### UC-CMP-0022 — Replay pre-activation accepted receipt

Actor: `mcp_client` · Kind: `lifecycle` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Replay an unchanged previously accepted compatibility mutation after project promotion.

**Expected results**

- Its retained accepted result is replayed under current authorization without reseeding or duplicating the business effect.

Sources: [backend/internal/platform/command/retry.go:1](../../../backend/internal/platform/command/retry.go#L1), [specs/002-scalable-core/validation/native-client-boundary.md:1](../../../specs/002-scalable-core/validation/native-client-boundary.md#L1).

<a id="uc-cmp-0023"></a>
### UC-CMP-0023 — Keep current routes native

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open first-party Issues or Boards for a legacy-marked project.

**Expected results**

- The current first-party native UI is used; canonical writes can promote project mode without an older editor route.

Sources: [specs/002-scalable-core/validation/native-client-boundary.md:1](../../../specs/002-scalable-core/validation/native-client-boundary.md#L1).

<a id="uc-cmp-0024"></a>
### UC-CMP-0024 — No public mode downgrade

Actor: `operator` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Look for a public operation that downgrades a project to legacy mode.

**Expected results**

- No public downgrade endpoint is provided; a test must not assume this operation exists.

Sources: [specs/002-scalable-core/validation/native-client-boundary.md:1](../../../specs/002-scalable-core/validation/native-client-boundary.md#L1).

<a id="uc-cmp-0025"></a>
### UC-CMP-0025 — Reject fresh get_issue in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke get_issue through its published V1 surface with otherwise valid arguments.

**Expected results**

- The V1 read rejects with client-version upgrade guidance rather than returning a lossy custom-choice projection.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `get_issue`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Operation discovery does not imply compatibility with every modern project.

<a id="uc-cmp-0026"></a>
### UC-CMP-0026 — Reject fresh search_issues in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke search_issues through its published V1 surface with otherwise valid arguments.

**Expected results**

- V1 search rejects when its authorized project scope includes modern-mode work, rather than silently returning a partial or lossy search.

Sources: [backend/internal/features/issues/search.go:1](../../../backend/internal/features/issues/search.go#L1).

Shared business operations: `search_issues`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Operation discovery does not imply compatibility with every modern project.

<a id="uc-cmp-0027"></a>
### UC-CMP-0027 — Reject fresh create_issue in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke create_issue through its published V1 surface with otherwise valid arguments.

**Expected results**

- A fresh V1 create is rejected with client-version guidance; a previously accepted matching receipt is treated separately.

Sources: [backend/internal/features/issues/compatibility.go:8](../../../backend/internal/features/issues/compatibility.go#L8).

Shared business operations: `create_issue`.

Related test files: [compatibility_test.go](../../../backend/internal/features/issues/compatibility_test.go).

Note: Operation discovery does not imply compatibility with every modern project.

<a id="uc-cmp-0028"></a>
### UC-CMP-0028 — Reject fresh get_board in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke get_board through its published V1 surface with otherwise valid arguments.

**Expected results**

- A V1 board read is rejected with guidance to native board layout and identifier-based operations.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `get_board`.

Note: Operation discovery does not imply compatibility with every modern project.

<a id="uc-cmp-0029"></a>
### UC-CMP-0029 — Reject fresh create_board in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke create_board through its published V1 surface with otherwise valid arguments.

**Expected results**

- A fresh V1 board create rejects with guidance to create_board_v2.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `create_board`.

Note: Operation discovery does not imply compatibility with every modern project.

<a id="uc-cmp-0030"></a>
### UC-CMP-0030 — Reject fresh list_board_cards in modern project

Actor: `mcp_client` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The caller has current project access and the relevant project is in modern mode.

**Steps**

1. Invoke list_board_cards through its published V1 surface with otherwise valid arguments.

**Expected results**

- A V1 column-card read rejects for a modern project instead of mapping independent columns to legacy status tokens.

Sources: [backend/internal/features/boards/service.go:1](../../../backend/internal/features/boards/service.go#L1).

Shared business operations: `list_board_cards`.

Note: Operation discovery does not imply compatibility with every modern project.
