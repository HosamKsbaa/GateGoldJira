# Unified attachments, private previews and recoverable uploads

Native queue and panel actions plus typed transfer boundaries. Distinguishes policy-driven file capacity, ten-MiB image/direct uploads and one-MiB chunks.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `queue`: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1)
- `queueLogic`: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90)
- `metadata`: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26)
- `panel`: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1)
- `preview`: [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23)
- `reference`: [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27)
- `resume`: [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18)
- `assets`: [backend/internal/features/attachments/assets.go:60](../../../backend/internal/features/attachments/assets.go#L60)
- `detach`: [backend/internal/features/attachments/assets.go:130](../../../backend/internal/features/attachments/assets.go#L130)
- `download`: [backend/internal/features/attachments/assets.go:205](../../../backend/internal/features/attachments/assets.go#L205)
- `upload`: [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193)
- `contentValidation`: [backend/internal/features/attachments/asset_upload.go:34](../../../backend/internal/features/attachments/asset_upload.go#L34)
- `contracts`: [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32)
- `mcp`: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31)
- `commentPublish`: [backend/internal/features/comments/service.go:188](../../../backend/internal/features/comments/service.go#L188)
- `descriptionPublish`: [backend/internal/features/issues/description_pictures.go:1](../../../backend/internal/features/issues/description_pictures.go#L1)

## Cases

<a id="uc-ast-0001"></a>
### UC-AST-0001 — Choose one attachment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose one file.

**Expected results**

- File appears with filename, byte size and ready state.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0002"></a>
### UC-AST-0002 — Choose several attachments

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select several files.

**Expected results**

- Accepted files appear in same queue.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0003"></a>
### UC-AST-0003 — Drop attachments

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Drop files onto upload zone.

**Expected results**

- Files enter upload queue.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0004"></a>
### UC-AST-0004 — Remove pending attachment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove a queued file.

**Expected results**

- It leaves queue without publication.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0005"></a>
### UC-AST-0005 — Clear pending queue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Clear queue.

**Expected results**

- Pending queue clears when no transfer is active.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0006"></a>
### UC-AST-0006 — Upload queued attachments

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Upload queued files.

**Expected results**

- Per-file progress and accepted/failed states appear.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0007"></a>
### UC-AST-0007 — Dismiss completed queue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Dismiss uploaded files.

**Expected results**

- Uploaded queue entries are dismissed without deleting attachments.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0008"></a>
### UC-AST-0008 — Show upload progress

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Transfer a queued file in chunks.

**Expected results**

- Accessible progress reflects acknowledged received bytes.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0009"></a>
### UC-AST-0009 — Cancel active upload

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Cancel for an unfinished upload.

**Expected results**

- Transfer stops and cancellation is confirmed.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0010"></a>
### UC-AST-0010 — Retry uncertain cancel

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry a cancellation whose acknowledgment was lost.

**Expected results**

- Original cancel reference reconciles outcome.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0011"></a>
### UC-AST-0011 — Restore same-tab file queue

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen issue/upload scope with retained queue.

**Expected results**

- Selected files, session and progress restore.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0012"></a>
### UC-AST-0012 — Retry failed file

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry queue after a transfer failure.

**Expected results**

- Original file/session is reused rather than silently replaced.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts).

<a id="uc-ast-0013"></a>
### UC-AST-0013 — Upload PNG image

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid PNG image.

**Expected results**

- Validated protected image appears in unified panel with thumbnail.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-AST-0083](../features/assets.md#uc-ast-0083).

Note: Surface correction: Rendering the accepted image thumbnail in the unified panel requires the native browser. All original expected behavior remains on the native case.

<a id="uc-ast-0014"></a>
### UC-AST-0014 — Upload JPEG image

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid JPEG image.

**Expected results**

- Validated protected image appears in unified panel with thumbnail.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-AST-0084](../features/assets.md#uc-ast-0084).

Note: Surface correction: Rendering the accepted image thumbnail in the unified panel requires the native browser. All original expected behavior remains on the native case.

<a id="uc-ast-0015"></a>
### UC-AST-0015 — Upload WebP image

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid WebP image.

**Expected results**

- Validated protected image appears in unified panel with thumbnail.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-AST-0085](../features/assets.md#uc-ast-0085).

Note: Surface correction: Rendering the accepted image thumbnail in the unified panel requires the native browser. All original expected behavior remains on the native case.

<a id="uc-ast-0016"></a>
### UC-AST-0016 — Upload PDF file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid PDF file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0017"></a>
### UC-AST-0017 — Upload text file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid text file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0018"></a>
### UC-AST-0018 — Upload CSV file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid CSV file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0019"></a>
### UC-AST-0019 — Upload Word DOCX file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid Word DOCX file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0020"></a>
### UC-AST-0020 — Upload Excel XLSX file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid Excel XLSX file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0021"></a>
### UC-AST-0021 — Upload unknown binary file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a valid unknown binary file.

**Expected results**

- A protected file attachment is accepted with safe supported metadata.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0022"></a>
### UC-AST-0022 — Read unified attachment panel

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open Attachments.

**Expected results**

- Published pictures and files share one list/count.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `list_assets`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0079](../features/assets.md#uc-ast-0079).

Note: Surface correction: The unified panel presentation requires the native client. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-ast-0023"></a>
### UC-AST-0023 — Refresh attachment panel

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Refresh attachments.

**Expected results**

- List and matching count refresh.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `list_assets`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0079](../features/assets.md#uc-ast-0079).

Note: Surface correction: Refreshing or appending the visible unified attachment panel is native client state. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-ast-0024"></a>
### UC-AST-0024 — Page attachments

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Load more attachments.

**Expected results**

- Next cursor page appends.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `list_assets`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0079](../features/assets.md#uc-ast-0079).

Note: Surface correction: Refreshing or appending the visible unified attachment panel is native client state. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-ast-0025"></a>
### UC-AST-0025 — Open picture preview

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click image thumbnail.

**Expected results**

- Correct protected image opens in preview dialog.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0026"></a>
### UC-AST-0026 — Open file-name preview

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click attachment filename.

**Expected results**

- Correct attachment preview dialog opens.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0027"></a>
### UC-AST-0027 — Preview PDF

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open PDF attachment.

**Expected results**

- Private PDF content renders in bounded preview frame.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0028"></a>
### UC-AST-0028 — Open unknown-file preview

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open a nonpreviewable document.

**Expected results**

- Download fallback is explained.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0029"></a>
### UC-AST-0029 — Download attachment

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Download.

**Expected results**

- Authenticated content saves using original filename.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0078](../features/assets.md#uc-ast-0078).

Note: Surface correction: Saving a browser download with its suggested filename is a native action. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0030"></a>
### UC-AST-0030 — Download from preview

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Download file in preview.

**Expected results**

- Current private content saves using original filename.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074), [UC-AST-0078](../features/assets.md#uc-ast-0078).

Note: Surface correction: The native preview/referral control and its retry/open state cannot be asserted by a stateless asset read. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0031"></a>
### UC-AST-0031 — Close preview button

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Close attachment preview.

**Expected results**

- Dialog closes and temporary object URL is released.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0032"></a>
### UC-AST-0032 — Close preview by Escape

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Press Escape in preview.

**Expected results**

- Dialog closes without changing attachment.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074).

Note: Surface correction: Only the native client opens/renders/closes this preview, owns its object URL, or explains a download fallback. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0033"></a>
### UC-AST-0033 — Retry attachment preview

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Retry preview after load failure.

**Expected results**

- Protected content lookup is retried.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074), [UC-AST-0078](../features/assets.md#uc-ast-0078).

Note: Surface correction: The native preview/referral control and its retry/open state cannot be asserted by a stateless asset read. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0034"></a>
### UC-AST-0034 — Open retained file reference

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Click a file reference in saved text/history.

**Expected results**

- Current-authorized metadata and preview open for retained asset.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0074](../features/assets.md#uc-ast-0074), [UC-AST-0078](../features/assets.md#uc-ast-0078).

Note: Surface correction: The native preview/referral control and its retry/open state cannot be asserted by a stateless asset read. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-ast-0035"></a>
### UC-AST-0035 — Recover unavailable reference

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open unavailable protected reference.

**Expected results**

- Attachment unavailable message appears without exposing content.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Related cases: [UC-AST-0080](../features/assets.md#uc-ast-0080).

Note: Surface correction: Showing an unavailable reference message is native presentation. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-ast-0036"></a>
### UC-AST-0036 — Detach published panel asset

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove an attachment from shared panel.

**Expected results**

- Panel membership is removed while retained historical references and bytes remain.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [backend/internal/features/attachments/assets.go:130](../../../backend/internal/features/attachments/assets.go#L130).

Shared business operations: `detach_asset`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

<a id="uc-ast-0037"></a>
### UC-AST-0037 — Review stale detach

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Detach using old issue revision.

**Expected results**

- Current attachments/revision must be reviewed before retry.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [backend/internal/features/attachments/assets.go:130](../../../backend/internal/features/attachments/assets.go#L130).

Shared business operations: `detach_asset`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-AST-0081](../features/assets.md#uc-ast-0081).

Note: Surface correction: Retaining visible attachments for deliberate stale-detach review is native client state. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-ast-0038"></a>
### UC-AST-0038 — Keep historical file after detach

Actor: `reader` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open old comment/version file after panel detach.

**Expected results**

- Authorized retained reference remains readable.

Sources: [backend/internal/features/attachments/assets.go:130](../../../backend/internal/features/attachments/assets.go#L130), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [issue-workspace.spec.ts](../../../frontend/e2e/issue-workspace.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

<a id="uc-ast-0039"></a>
### UC-AST-0039 — Hide comment draft assets

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload comment draft without posting.

**Expected results**

- Other users do not see draft as published issue attachment.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/comments/service.go:188](../../../backend/internal/features/comments/service.go#L188).

Shared business operations: `start_asset_upload`, `finalize_asset_upload`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-ast-0040"></a>
### UC-AST-0040 — Publish comment assets atomically

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post comment referencing completed own drafts.

**Expected results**

- Assets publish with accepted comment and appear in shared panel.

Sources: [backend/internal/features/comments/service.go:188](../../../backend/internal/features/comments/service.go#L188).

Shared business operations: `create_comment`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-ast-0041"></a>
### UC-AST-0041 — Hide description draft assets

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload into description draft without saving.

**Expected results**

- Assets remain private until accepted description save.

Sources: [backend/internal/features/issues/description_pictures.go:1](../../../backend/internal/features/issues/description_pictures.go#L1), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90).

Shared business operations: `start_asset_upload`, `finalize_asset_upload`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-ast-0042"></a>
### UC-AST-0042 — Publish description assets atomically

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save description referencing completed drafts.

**Expected results**

- Referenced assets become published with accepted issue content.

Sources: [backend/internal/features/issues/description_pictures.go:1](../../../backend/internal/features/issues/description_pictures.go#L1).

Shared business operations: `update_issue_v2`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-ast-0043"></a>
### UC-AST-0043 — Retain ID-based references across hostname

Actor: `reader` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open a saved file reference after frontend hostname changes.

**Expected results**

- Reference resolves through current application asset endpoint.

Sources: [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-ast-0044"></a>
### UC-AST-0044 — Reject empty file

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Queue a zero-byte file.

**Expected results**

- File validation rejects it.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26).

<a id="uc-ast-0045"></a>
### UC-AST-0045 — Reject invalid filename

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Queue filename with control character or path separator.

**Expected results**

- File validation rejects unsafe name.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26).

<a id="uc-ast-0046"></a>
### UC-AST-0046 — Limit file queue

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Queue more than twenty files.

**Expected results**

- Additional queue items are rejected with guidance.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90).

<a id="uc-ast-0047"></a>
### UC-AST-0047 — Enforce configured file maximum

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Queue file exceeding current policy maximum.

**Expected results**

- Displayed policy limit is enforced.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32).

Gaps: [GAP-AST-001](../gaps.md#gap-ast-001).

<a id="uc-ast-0048"></a>
### UC-AST-0048 — Enforce image maximum

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Queue PNG/JPEG/WebP larger than min(policy maximum,10 MiB).

**Expected results**

- Image is rejected.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26).

Gaps: [GAP-AST-001](../gaps.md#gap-ast-001).

<a id="uc-ast-0049"></a>
### UC-AST-0049 — Validate actual image content

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload bytes mismatching claimed image format.

**Expected results**

- Content validation prevents accepted image.

Sources: [backend/internal/features/attachments/asset_upload.go:34](../../../backend/internal/features/attachments/asset_upload.go#L34).

Shared business operations: `upload_asset`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0050"></a>
### UC-AST-0050 — Validate actual document content

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload bytes mismatching supported document metadata.

**Expected results**

- Content validation prevents accepted typed document.

Sources: [backend/internal/features/attachments/asset_upload.go:34](../../../backend/internal/features/attachments/asset_upload.go#L34).

Shared business operations: `upload_asset`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

<a id="uc-ast-0051"></a>
### UC-AST-0051 — Reject foreign draft reference

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Publish another issue or user private draft reference.

**Expected results**

- Current scope/ownership validation rejects publication.

Sources: [backend/internal/features/attachments/assets.go:60](../../../backend/internal/features/attachments/assets.go#L60), [backend/internal/features/comments/service.go:188](../../../backend/internal/features/comments/service.go#L188).

<a id="uc-ast-0052"></a>
### UC-AST-0052 — Reject unauthorized content

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read protected asset without current project access.

**Expected results**

- No metadata or bytes leak.

Sources: [backend/internal/features/attachments/assets.go:60](../../../backend/internal/features/attachments/assets.go#L60), [backend/internal/features/attachments/assets.go:205](../../../backend/internal/features/attachments/assets.go#L205).

<a id="uc-ast-0053"></a>
### UC-AST-0053 — Restrict viewer upload

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload as project viewer.

**Expected results**

- Current project write access rejects upload.

Sources: [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

<a id="uc-ast-0054"></a>
### UC-AST-0054 — Recheck access after storage read

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Lose access while private bytes are being loaded.

**Expected results**

- Post-I/O authorization prevents returning protected bytes.

Sources: [backend/internal/features/attachments/assets.go:205](../../../backend/internal/features/attachments/assets.go#L205).

Related test files: [coverage-native-asset-authorization.spec.ts](../../../frontend/e2e/coverage-native-asset-authorization.spec.ts).

Note: The native Playwright scenario uses the normal Download action and a Linux write lease on only its freshly uploaded, isolated local text object. The kernel's SIGIO proves the real Go storage open is waiting; actual project membership is removed before releasing the lease. The actual typed 404 response contains no protected bytes, no browser download occurs, and the UI shows the denial. The lease fixture does not modify stored bytes or metadata. Finally cleanup restores membership and verifies the original content through the service.

Note: This verifies the real local object-store post-I/O authorization boundary without an application test hook. It does not verify Google Cloud Storage provider behavior. Additional deterministic account-revocation and upload interleavings remain supplemental Go service evidence in docs/use-cases/service-evidence.json; those do not substitute for browser surface evidence.

<a id="uc-ast-0055"></a>
### UC-AST-0055 — Preserve Arabic filenames

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload/download an Arabic or mixed-language filename.

**Expected results**

- Accepted filename is retained and readable without path interpretation.

Sources: [frontend/src/app/features/attachments/attachment-files.ts:26](../../../frontend/src/app/features/attachments/attachment-files.ts#L26), [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1).

Shared business operations: `start_asset_upload`, `finalize_asset_upload`.

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-ast-0056"></a>
### UC-AST-0056 — Read asset policy

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read upload policy.

**Expected results**

- Current file/image/chunk limits are returned.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_policy`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0057"></a>
### UC-AST-0057 — Start recoverable session

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reserve upload with metadata, expected byte count and SHA-256.

**Expected results**

- An actor-scoped session identifies intended asset and offsets.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `start_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0058"></a>
### UC-AST-0058 — Read recoverable session

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read own upload session.

**Expected results**

- Current progress and terminal state are returned.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0059"></a>
### UC-AST-0059 — Append exact-offset chunk

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Append a valid chunk at acknowledged offset.

**Expected results**

- Received byte count advances exactly.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0060"></a>
### UC-AST-0060 — Finalize complete session

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Finalize after all valid bytes arrive.

**Expected results**

- Size, SHA-256 and content verify before one asset commits.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `finalize_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0061"></a>
### UC-AST-0061 — Cancel unfinished session

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel own unfinished session.

**Expected results**

- Session becomes canceled and cannot publish later.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `cancel_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0062"></a>
### UC-AST-0062 — Replay lost chunk acknowledgment

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry identical chunk with original retry reference.

**Expected results**

- Accepted bytes are not appended twice.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-AST-0086](../features/assets.md#uc-ast-0086).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

Note: Surface correction: The native resumable uploader first reads the authoritative session after a lost chunk acknowledgement and skips committed offsets. Its ordinary retry does not resend that accepted chunk with its original reference; exact same-reference replay remains a REST/MCP operation boundary and the native resume outcome is preserved separately.

<a id="uc-ast-0063"></a>
### UC-AST-0063 — Replay lost finalize acknowledgment

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry original finalize reference.

**Expected results**

- One committed asset is returned without duplicate publication.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `finalize_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-AST-0064](../features/assets.md#uc-ast-0064).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

Note: Surface correction: The native resumable uploader reads an already committed session and fetches its existing asset after a lost finalize acknowledgement. It does not resubmit the original finalize request in this reachable flow; exact finalize reference replay remains required on REST/MCP and committed-session native recovery is separately preserved.

<a id="uc-ast-0064"></a>
### UC-AST-0064 — Resume committed session

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Resume after final acknowledgment was lost.

**Expected results**

- Client reads existing committed asset rather than retransferring.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_upload`, `get_asset`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0065"></a>
### UC-AST-0065 — Reject wrong offset

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Append chunk at different offset from received bytes.

**Expected results**

- Append is rejected without corrupting progress.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0066"></a>
### UC-AST-0066 — Reject oversized chunk

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Append more than one MiB in a chunk.

**Expected results**

- Chunk is rejected.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0067"></a>
### UC-AST-0067 — Reject misaligned nonfinal chunk

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Append nonfinal chunk not a multiple of 256 KiB.

**Expected results**

- Chunk is rejected.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0068"></a>
### UC-AST-0068 — Reject wrong checksum

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Finalize bytes with wrong complete SHA-256.

**Expected results**

- Corrupt asset is not committed.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `finalize_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0069"></a>
### UC-AST-0069 — Reject incomplete finalization

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Finalize before expected bytes arrive.

**Expected results**

- Asset is not published.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `finalize_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0070"></a>
### UC-AST-0070 — Reject expired session resume

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Resume canceled/expired session.

**Expected results**

- User is told to choose file/start again.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_upload`.

Related cases: [UC-AST-0082](../features/assets.md#uc-ast-0082).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

Note: Surface correction: Telling the user to choose a file/start again is native queue presentation; the service returns a terminal state and rejects writes. All original expected behavior remains on the native case.

<a id="uc-ast-0071"></a>
### UC-AST-0071 — Reject other actor session

Actor: `writer` · Kind: `permission` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read or mutate another user upload session.

**Expected results**

- Session ownership prevents access.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_upload`, `append_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0072"></a>
### UC-AST-0072 — Reject committed-session cancel

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Cancel an already committed asset session.

**Expected results**

- Published asset is not canceled.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `cancel_asset_upload`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0073"></a>
### UC-AST-0073 — Direct base64 upload

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The client is authenticated with access to the relevant project/resource.

**Steps**

1. Upload up to ten MiB using direct upload tool.

**Expected results**

- Validated asset is returned without claiming resumable hundred-MiB capacity.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `upload_asset`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Gaps: [GAP-AST-001](../gaps.md#gap-ast-001).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0074"></a>
### UC-AST-0074 — Download bounded chunk

Actor: `mcp_client` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The client is authenticated with access to the relevant project/resource.

**Steps**

1. Request private bytes by offset/count.

**Expected results**

- At most one MiB and terminal indicator are returned under current access.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `download_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Note: Overall server maximum is 100 MiB; ordinary file limit is policy-driven, images/direct upload remain at most 10 MiB; resumable chunk at most 1 MiB.

<a id="uc-ast-0075"></a>
### UC-AST-0075 — Ignore late preview across sessions

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open a private attachment preview and hold its content response.
2. Close the loading preview through its normal control, then sign out and sign in as a different user in the same SPA before releasing the old response.

**Expected results**

- Old private result cannot populate new session and request is aborted on cleanup.

Sources: [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23).

Note: The native preview dialog makes background Sign out inert. This reachable flow verifies cleanup abort and session ownership without bypassing modal interaction rules or reloading the SPA.

<a id="uc-ast-0076"></a>
### UC-AST-0076 — Expose accessible file progress

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Inspect active upload with assistive technology.

**Expected results**

- File-specific progress labels and errors are exposed.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.html:1](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.html#L1).

<a id="uc-ast-0077"></a>
### UC-AST-0077 — Permanently delete retained attachment bytes

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt permanent deletion of published retained bytes through issue panel.

**Expected results**

- Panel exposes detach, not ordinary permanent byte deletion.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31).

<a id="uc-ast-0078"></a>
### UC-AST-0078 — Read original attachment filename and exact private bytes

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read authorized asset metadata and its content chunks.

**Expected results**

- Metadata preserves the original filename and assembled chunk bytes equal the accepted stored file.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-AST-0029](../features/assets.md#uc-ast-0029).

Note: Atomic service outcome separated from the native UI behavior in UC-AST-0029. Its browser behavior remains in the original stable case.

<a id="uc-ast-0079"></a>
### UC-AST-0079 — Read unified published asset cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read issue assets with a bounded page and advance its cursor.

**Expected results**

- Published images and files share a matching total and distinct authorized cursor pages.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `list_assets`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-AST-0022](../features/assets.md#uc-ast-0022).

Note: Atomic service outcome separated from native UI case UC-AST-0022.

<a id="uc-ast-0080"></a>
### UC-AST-0080 — Deny unavailable asset metadata and bytes

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read unavailable or unauthorized asset metadata and a content chunk.

**Expected results**

- Both reads return unavailable without exposing metadata or bytes.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts:23](../../../frontend/src/app/features/attachments/components/file-preview/file-preview.component.ts#L23), [frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts:27](../../../frontend/src/app/features/attachments/components/attachment-reference/attachment-reference.component.ts#L27).

Shared business operations: `get_asset`, `download_asset_chunk`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-AST-0035](../features/assets.md#uc-ast-0035).

Note: Atomic service outcome separated from native UI case UC-AST-0035.

<a id="uc-ast-0081"></a>
### UC-AST-0081 — Reject stale asset detach command

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Detach a published asset using an obsolete issue revision.

**Expected results**

- The conflict rejects the command and preserves published panel membership.

Sources: [frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html:1](../../../frontend/src/app/features/attachments/components/issue-attachments/issue-attachments.component.html#L1), [backend/internal/features/attachments/assets.go:130](../../../backend/internal/features/attachments/assets.go#L130).

Shared business operations: `detach_asset`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-AST-0037](../features/assets.md#uc-ast-0037).

Note: Atomic service outcome separated from native UI case UC-AST-0037.

<a id="uc-ast-0082"></a>
### UC-AST-0082 — Read expired upload state and reject resumed writes

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read an expired actor-owned upload, then attempt append and finalization.

**Expected results**

- Expired terminal state remains readable; append/finalize reject and no asset publishes.

Sources: [backend/internal/features/attachments/asset_mcp.go:31](../../../backend/internal/features/attachments/asset_mcp.go#L31), [backend/internal/features/attachments/asset_types.go:32](../../../backend/internal/features/attachments/asset_types.go#L32), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Shared business operations: `get_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-AST-0070](../features/assets.md#uc-ast-0070).

Note: Atomic service outcome separated from native case UC-AST-0070. Browser behavior and its stable ID are unchanged.

<a id="uc-ast-0083"></a>
### UC-AST-0083 — Accept validated protected PNG bytes

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a real PNG image and read its authorized metadata/content.

**Expected results**

- Validated published image metadata retains the accepted format, filename and size; downloaded private bytes equal the accepted encoded image.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `upload_asset`, `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`, `get_asset`, `download_asset_chunk`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-collaboration.spec.ts](../../../frontend/e2e/coverage-collaboration.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-AST-0013](../features/assets.md#uc-ast-0013).

Note: Atomic service outcome separated from native case UC-AST-0013. Browser behavior and its stable ID are unchanged.

<a id="uc-ast-0084"></a>
### UC-AST-0084 — Accept validated protected JPEG bytes

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a real JPEG image and read its authorized metadata/content.

**Expected results**

- Validated published image metadata retains the accepted format, filename and size; downloaded private bytes equal the accepted encoded image.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `upload_asset`, `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`, `get_asset`, `download_asset_chunk`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-AST-0014](../features/assets.md#uc-ast-0014).

Note: Atomic service outcome separated from native case UC-AST-0014. Browser behavior and its stable ID are unchanged.

<a id="uc-ast-0085"></a>
### UC-AST-0085 — Accept validated protected WebP bytes

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Upload a real WebP image and read its authorized metadata/content.

**Expected results**

- Validated published image metadata retains the accepted format, filename and size; downloaded private bytes equal the accepted encoded image.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [backend/internal/features/attachments/asset_upload.go:193](../../../backend/internal/features/attachments/asset_upload.go#L193).

Shared business operations: `upload_asset`, `start_asset_upload`, `append_asset_chunk`, `finalize_asset_upload`, `get_asset`, `download_asset_chunk`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-AST-0015](../features/assets.md#uc-ast-0015).

Note: Atomic service outcome separated from native case UC-AST-0015. Browser behavior and its stable ID are unchanged.

<a id="uc-ast-0086"></a>
### UC-AST-0086 — Resume accepted chunk progress after a lost acknowledgement

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A native upload has an actor-owned recoverable session and its first chunk was accepted before the acknowledgement was lost.

**Steps**

1. Retry the failed native upload queue.

**Expected results**

- The uploader reads committed progress and skips the accepted chunk; remaining offsets upload once and exactly one complete asset with the original bytes publishes.

Sources: [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18), [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90).

Related test files: [coverage-native-assets-extra.spec.ts](../../../frontend/e2e/coverage-native-assets-extra.spec.ts).

Related cases: [UC-AST-0062](../features/assets.md#uc-ast-0062).

Note: Atomic native resume flow distinct from exact same-reference service replay.

<a id="uc-ast-0087"></a>
### UC-AST-0087 — Ignore accepted cancellation after queue destruction and account replacement

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- An unfinished resumable upload and another private queued file belong to the current signed-in account.

**Steps**

1. Cancel the resumable upload, hold its accepted response, leave the issue, sign out, sign in as another account in the same SPA, release the old reply, and reopen the issue.

**Expected results**

- The old reply restores neither private files nor dirty state or errors, starts no upload, and does not prevent the new account from canceling its own queue.

Sources: [frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts:90](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.component.ts#L90), [frontend/src/app/features/attachments/resumable-upload.ts:18](../../../frontend/src/app/features/attachments/resumable-upload.ts#L18).

Related test files: [upload-cancellation-ownership.spec.ts](../../../frontend/e2e/upload-cancellation-ownership.spec.ts), [file-queue.state.spec.ts](../../../frontend/src/app/features/attachments/components/file-queue/file-queue.state.spec.ts).
