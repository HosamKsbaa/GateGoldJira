# Rich descriptions, discussion and selected mentions

Editor actions are documented independently for descriptions and comments because their capabilities differ. Notifications have their own area.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `commentEditor`: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1)
- `commentActions`: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108)
- `commentSource`: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:425](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L425)
- `commentSubmit`: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604)
- `descriptionEditor`: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1)
- `descriptionActions`: [frontend/src/app/features/issues/components/description-editor/description-editor.component.ts:102](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.ts#L102)
- `richBlocks`: [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67)
- `thread`: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45)
- `commentSave`: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327)
- `mentions`: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26)
- `mentionRules`: [backend/internal/features/comments/mentions.go:10](../../../backend/internal/features/comments/mentions.go#L10)
- `commentRules`: [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81)
- `commentHtml`: [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248)
- `descriptionHtml`: [backend/internal/features/issues/description.go:15](../../../backend/internal/features/issues/description.go#L15)
- `mcp`: [backend/internal/features/comments/mcp.go:11](../../../backend/internal/features/comments/mcp.go#L11)

## Cases

<a id="uc-com-0001"></a>
### UC-COM-0001 — Description: enter text

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Enter text.

**Expected results**

- Plain Unicode text and paragraph boundaries remain editable.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0002"></a>
### UC-COM-0002 — Description: toggle bold

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle bold.

**Expected results**

- Selected/new text uses bold formatting.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0003"></a>
### UC-COM-0003 — Description: toggle italic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle italic.

**Expected results**

- Selected/new text uses italic formatting.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0004"></a>
### UC-COM-0004 — Description: toggle underline

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle underline.

**Expected results**

- Selected/new text uses underline formatting.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0005"></a>
### UC-COM-0005 — Description: toggle bullet list

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle bullet list.

**Expected results**

- Unordered list structure appears.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0006"></a>
### UC-COM-0006 — Description: toggle numbered list

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle numbered list.

**Expected results**

- Ordered list structure appears.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0007"></a>
### UC-COM-0007 — Description: toggle quote

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle quote.

**Expected results**

- Blockquote structure appears.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0008"></a>
### UC-COM-0008 — Description: toggle code block

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle code block.

**Expected results**

- Code is represented literally rather than executed.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0009"></a>
### UC-COM-0009 — Description: toggle checklist

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Toggle checklist.

**Expected results**

- Editable checklist structure appears.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0010"></a>
### UC-COM-0010 — Description: change checklist completion

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Change checklist completion.

**Expected results**

- Checked state changes and remains in saved/reloaded document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0011"></a>
### UC-COM-0011 — Description: insert table

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Insert table.

**Expected results**

- A 3 by 3 table with header row appears.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0012"></a>
### UC-COM-0012 — Description: add row below

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Add row below.

**Expected results**

- A new table row appears below the selected row.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0013"></a>
### UC-COM-0013 — Description: add column after

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Add column after.

**Expected results**

- A new table column appears after selected column.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0014"></a>
### UC-COM-0014 — Description: delete table row

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Delete table row.

**Expected results**

- Selected table row is removed without deleting surrounding document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0015"></a>
### UC-COM-0015 — Description: delete table column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Delete table column.

**Expected results**

- Selected table column is removed without deleting surrounding document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0016"></a>
### UC-COM-0016 — Description: delete table

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Delete table.

**Expected results**

- Table is removed and surrounding text remains.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0017"></a>
### UC-COM-0017 — Description: insert http link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Insert HTTP link.

**Expected results**

- Selected text becomes a safe HTTP hyperlink.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0018"></a>
### UC-COM-0018 — Description: insert https link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Insert HTTPS link.

**Expected results**

- Selected text becomes a safe HTTPS hyperlink.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0019"></a>
### UC-COM-0019 — Description: open html source

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Open HTML source.

**Expected results**

- Current formatted document is exposed as source.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0020"></a>
### UC-COM-0020 — Description: preview supported html

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Preview supported HTML.

**Expected results**

- Supported source edits become editable visual content.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0021"></a>
### UC-COM-0021 — Description: return to visual editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Return to visual editor.

**Expected results**

- Valid source changes remain in visual document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0022"></a>
### UC-COM-0022 — Description: choose automatic direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Choose automatic direction.

**Expected results**

- Block direction is automatic.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0023"></a>
### UC-COM-0023 — Description: choose rtl direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Choose RTL direction.

**Expected results**

- Block direction is explicitly right to left.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0024"></a>
### UC-COM-0024 — Description: choose ltr direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Choose LTR direction.

**Expected results**

- Block direction is explicitly left to right.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0025"></a>
### UC-COM-0025 — Description: paste picture

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Paste picture.

**Expected results**

- Picture enters protected upload/insertion flow; see asset catalog.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0026"></a>
### UC-COM-0026 — Description: attach file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Attach file.

**Expected results**

- A protected file reference can be inserted after upload; see asset catalog.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0027"></a>
### UC-COM-0027 — Description: preserve Arabic text

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Type Arabic mixed with Latin text and digits, then save/reload.

**Expected results**

- Text and configured direction survive round-trip.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Shared business operations: `update_issue_v2`.

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-com-0028"></a>
### UC-COM-0028 — Description: reject unsafe link

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Try adding a non-HTTP(S) or malformed URL.

**Expected results**

- Editor reports invalid link and preserves the document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

<a id="uc-com-0029"></a>
### UC-COM-0029 — Description: sanitize executable markup

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Save HTML containing script/event-handler/iframe/SVG markup.

**Expected results**

- Unsafe executable content does not execute in rendered document.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [backend/internal/features/issues/description.go:15](../../../backend/internal/features/issues/description.go#L15).

Shared business operations: `update_issue_v2`.

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts).

Related cases: [UC-COM-0122](../features/collaboration.md#uc-com-0122).

Note: Surface correction: Nonexecution in a rendered document requires a browser. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0030"></a>
### UC-COM-0030 — Description: retain nested rich blocks

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Save nested checklist/table content and restore a draft.

**Expected results**

- Surrounding text, rich structures and checked state remain.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0031"></a>
### UC-COM-0031 — Comment: enter text

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Enter text.

**Expected results**

- Plain Unicode text and paragraph boundaries remain editable.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0032"></a>
### UC-COM-0032 — Comment: toggle bold

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle bold.

**Expected results**

- Selected/new text uses bold formatting.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0033"></a>
### UC-COM-0033 — Comment: toggle italic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle italic.

**Expected results**

- Selected/new text uses italic formatting.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0034"></a>
### UC-COM-0034 — Comment: toggle underline

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle underline.

**Expected results**

- Selected/new text uses underline formatting.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0035"></a>
### UC-COM-0035 — Comment: toggle bullet list

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle bullet list.

**Expected results**

- Unordered list structure appears.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0036"></a>
### UC-COM-0036 — Comment: toggle numbered list

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle numbered list.

**Expected results**

- Ordered list structure appears.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0037"></a>
### UC-COM-0037 — Comment: toggle quote

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle quote.

**Expected results**

- Blockquote structure appears.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0038"></a>
### UC-COM-0038 — Comment: toggle code block

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle code block.

**Expected results**

- Code is represented literally rather than executed.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0039"></a>
### UC-COM-0039 — Comment: toggle checklist

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Toggle checklist.

**Expected results**

- Editable checklist structure appears.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0040"></a>
### UC-COM-0040 — Comment: change checklist completion

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Change checklist completion.

**Expected results**

- Checked state changes and remains in saved/reloaded document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0041"></a>
### UC-COM-0041 — Comment: insert table

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Insert table.

**Expected results**

- A 3 by 3 table with header row appears.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0042"></a>
### UC-COM-0042 — Comment: add row below

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Add row below.

**Expected results**

- A new table row appears below the selected row.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0043"></a>
### UC-COM-0043 — Comment: add column after

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Add column after.

**Expected results**

- A new table column appears after selected column.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0044"></a>
### UC-COM-0044 — Comment: delete table row

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Delete table row.

**Expected results**

- Selected table row is removed without deleting surrounding document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0045"></a>
### UC-COM-0045 — Comment: delete table column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Delete table column.

**Expected results**

- Selected table column is removed without deleting surrounding document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0046"></a>
### UC-COM-0046 — Comment: delete table

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Delete table.

**Expected results**

- Table is removed and surrounding text remains.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0047"></a>
### UC-COM-0047 — Comment: insert http link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Insert HTTP link.

**Expected results**

- Selected text becomes a safe HTTP hyperlink.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0048"></a>
### UC-COM-0048 — Comment: insert https link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Insert HTTPS link.

**Expected results**

- Selected text becomes a safe HTTPS hyperlink.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0049"></a>
### UC-COM-0049 — Comment: open html source

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Open HTML source.

**Expected results**

- Current formatted document is exposed as source.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0050"></a>
### UC-COM-0050 — Comment: preview supported html

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Preview supported HTML.

**Expected results**

- Supported source edits become editable visual content.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0051"></a>
### UC-COM-0051 — Comment: return to visual editor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Return to visual editor.

**Expected results**

- Valid source changes remain in visual document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0052"></a>
### UC-COM-0052 — Comment: choose automatic direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Choose automatic direction.

**Expected results**

- Block direction is automatic.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0053"></a>
### UC-COM-0053 — Comment: choose rtl direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Choose RTL direction.

**Expected results**

- Block direction is explicitly right to left.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0054"></a>
### UC-COM-0054 — Comment: choose ltr direction

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Choose LTR direction.

**Expected results**

- Block direction is explicitly left to right.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0055"></a>
### UC-COM-0055 — Comment: paste picture

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Paste picture.

**Expected results**

- Picture enters protected upload/insertion flow; see asset catalog.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0056"></a>
### UC-COM-0056 — Comment: attach file

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Attach file.

**Expected results**

- A protected file reference can be inserted after upload; see asset catalog.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

Note: Later persistence verification must save the containing description/comment and reload it; toolbar state alone does not establish persistence.

<a id="uc-com-0057"></a>
### UC-COM-0057 — Comment: preserve Arabic text

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Type Arabic mixed with Latin text and digits, then save/reload.

**Expected results**

- Text and configured direction survive round-trip.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Shared business operations: `create_comment`.

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-com-0058"></a>
### UC-COM-0058 — Comment: reject unsafe link

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Try adding a non-HTTP(S) or malformed URL.

**Expected results**

- Editor reports invalid link and preserves the document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

<a id="uc-com-0059"></a>
### UC-COM-0059 — Comment: sanitize executable markup

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Save HTML containing script/event-handler/iframe/SVG markup.

**Expected results**

- Unsafe executable content does not execute in rendered document.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts), [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0123](../features/collaboration.md#uc-com-0123).

Note: Surface correction: Nonexecution in a rendered comment requires a browser. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0060"></a>
### UC-COM-0060 — Comment: retain nested rich blocks

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Save nested checklist/table content and restore a draft.

**Expected results**

- Surrounding text, rich structures and checked state remain.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/rich-text-blocks.ts:67](../../../frontend/src/app/features/comments/rich-text-blocks.ts#L67).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0061"></a>
### UC-COM-0061 — Choose description heading 2

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 2.

**Expected results**

- Description block becomes H2.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0062"></a>
### UC-COM-0062 — Choose description heading 3

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 3.

**Expected results**

- Description block becomes H3.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0063"></a>
### UC-COM-0063 — Choose comment heading 1

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 1.

**Expected results**

- Comment block becomes H1.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0064"></a>
### UC-COM-0064 — Choose comment heading 2

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 2.

**Expected results**

- Comment block becomes H2.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0065"></a>
### UC-COM-0065 — Choose comment heading 3

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 3.

**Expected results**

- Comment block becomes H3.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0066"></a>
### UC-COM-0066 — Choose comment heading 4

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 4.

**Expected results**

- Comment block becomes H4.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0067"></a>
### UC-COM-0067 — Choose comment heading 5

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 5.

**Expected results**

- Comment block becomes H5.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0068"></a>
### UC-COM-0068 — Choose comment heading 6

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Heading 6.

**Expected results**

- Comment block becomes H6.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0069"></a>
### UC-COM-0069 — Reset heading to paragraph

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Paragraph in either editor.

**Expected results**

- Current block returns to paragraph structure.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1).

<a id="uc-com-0070"></a>
### UC-COM-0070 — Insert comment hard break

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Line break toolbar action.

**Expected results**

- A hard break is inserted.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108).

<a id="uc-com-0071"></a>
### UC-COM-0071 — Remove comment hyperlink

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Remove link for linked selection.

**Expected results**

- Text remains without hyperlink formatting.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1).

<a id="uc-com-0072"></a>
### UC-COM-0072 — Open composer from issue action

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Add comment on issue.

**Expected results**

- Comment composer receives focus.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

<a id="uc-com-0073"></a>
### UC-COM-0073 — Post comment

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit a valid completed comment.

**Expected results**

- One comment appears with author/time and discussion count updates.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Shared business operations: `create_comment`.

Related test files: [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-com-0074"></a>
### UC-COM-0074 — Reload comments

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Reload comments.

**Expected results**

- Latest first page and total replace prior discussion list.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related cases: [UC-COM-0124](../features/collaboration.md#uc-com-0124).

Note: Surface correction: Replacing an existing discussion list is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0075"></a>
### UC-COM-0075 — Append comments page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Next comments page.

**Expected results**

- Next oldest-first comments append.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related cases: [UC-COM-0125](../features/collaboration.md#uc-com-0125).

Note: Surface correction: Appending a page to already rendered records is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0076"></a>
### UC-COM-0076 — Read empty discussion

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open issue with no comments.

**Expected results**

- Empty/read-only discussion remains understandable without invented records.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-com-0077"></a>
### UC-COM-0077 — Open own comment by body

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Click own editable comment body.

**Expected results**

- Inline edit opens.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0078"></a>
### UC-COM-0078 — Open own comment by edit action

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Choose Edit comment.

**Expected results**

- Inline edit opens for correct comment.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45), [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

<a id="uc-com-0079"></a>
### UC-COM-0079 — Keep comment links interactive

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Click a link in editable comment body.

**Expected results**

- Link behavior occurs without opening comment edit.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0080"></a>
### UC-COM-0080 — Keep comment media interactive

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Click comment picture or attachment reference.

**Expected results**

- Media action occurs without opening comment edit.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Related test files: [rich-text-blocks.spec.ts](../../../frontend/e2e/rich-text-blocks.spec.ts).

<a id="uc-com-0081"></a>
### UC-COM-0081 — Select comment text

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Select text in own comment.

**Expected results**

- Text selection does not force edit mode.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

<a id="uc-com-0082"></a>
### UC-COM-0082 — Save own comment revision

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Save edited comment.

**Expected results**

- New retained version appears with Edited marker and version.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327), [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81).

Shared business operations: `update_comment`.

Related test files: [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0126](../features/collaboration.md#uc-com-0126).

Note: Surface correction: The Edited marker is a native presentation of the accepted revision. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0083"></a>
### UC-COM-0083 — Cancel clean comment edit

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Choose Cancel comment edit on clean form.

**Expected results**

- Stored comment remains unchanged.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

<a id="uc-com-0084"></a>
### UC-COM-0084 — Protect dirty comment edit

Actor: `author` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Cancel a comment edit containing unsaved work.

**Expected results**

- Discard confirmation protects draft.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

<a id="uc-com-0085"></a>
### UC-COM-0085 — Read comment versions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Comment history.

**Expected results**

- Retained immutable versions display oldest first.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comment_versions`.

Related test files: [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-com-0086"></a>
### UC-COM-0086 — Page comment versions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Next versions page.

**Expected results**

- Next history page replaces displayed version page.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comment_versions`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0127](../features/collaboration.md#uc-com-0127).

Note: Version history uses page replacement; comments use appending.

Note: Surface correction: Replacing the displayed version page is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0087"></a>
### UC-COM-0087 — Close comment versions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Close comment history.

**Expected results**

- History region closes.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

<a id="uc-com-0088"></a>
### UC-COM-0088 — Review concurrent comment edit

Actor: `author` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Save against an outdated comment revision.

**Expected results**

- Latest version is offered; unsent draft remains.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Shared business operations: `update_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0128](../features/collaboration.md#uc-com-0128).

Note: Surface correction: Retaining an unsent draft and offering review are native editor behavior. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0089"></a>
### UC-COM-0089 — Rebase comment draft explicitly

Actor: `author` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Choose Use current revision and keep my draft.

**Expected results**

- Draft remains and next save uses reviewed current revision.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Shared business operations: `update_comment`.

Related cases: [UC-COM-0128](../features/collaboration.md#uc-com-0128), [UC-COM-0126](../features/collaboration.md#uc-com-0126).

Note: Surface correction: The explicit rebase control owns a native unsent draft. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0090"></a>
### UC-COM-0090 — Replay uncertain comment post

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry accepted comment after lost response.

**Expected results**

- Original intention/reference yields one comment.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327), [backend/internal/features/comments/mcp.go:11](../../../backend/internal/features/comments/mcp.go#L11).

Shared business operations: `create_comment`.

Related test files: [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0091"></a>
### UC-COM-0091 — Replay uncertain comment update

Actor: `author` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Retry accepted edit after lost response.

**Expected results**

- Original intention/reference yields one accepted revision.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327), [backend/internal/features/comments/mcp.go:11](../../../backend/internal/features/comments/mcp.go#L11).

Shared business operations: `update_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0092"></a>
### UC-COM-0092 — Preserve comments on read failure

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Cause a discussion request to fail.

**Expected results**

- Request error is surfaced rather than false successful empty discussion.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related cases: [UC-COM-0124](../features/collaboration.md#uc-com-0124).

Note: Surface correction: A stateless failed list request cannot preserve already rendered client records. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0093"></a>
### UC-COM-0093 — Clear inaccessible discussion

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Lose project access and reload comments.

**Expected results**

- Forbidden/unavailable response clears rendered records and editor context.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related cases: [UC-COM-0129](../features/collaboration.md#uc-com-0129).

Note: Surface correction: Clearing an already rendered discussion/editor requires the native client. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0094"></a>
### UC-COM-0094 — Reject nonauthor edit

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt to edit another author comment, including as administrator.

**Expected results**

- Current author-only write rule rejects mutation.

Sources: [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81).

Shared business operations: `update_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0137](../features/collaboration.md#uc-com-0137).

Note: Surface correction: Native comment records expose Edit comment only when the current actor is the author. Administrators can read another author content and history but cannot invoke an edit through ordinary controls; direct author-only mutation rejection remains on REST/MCP.

<a id="uc-com-0095"></a>
### UC-COM-0095 — Show viewer discussion

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open issue as viewer.

**Expected results**

- Comments/history are readable and composer is unavailable.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45), [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81).

<a id="uc-com-0096"></a>
### UC-COM-0096 — Reject comment in archived project

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post/update after project becomes archived.

**Expected results**

- Current project access prevents write.

Sources: [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81).

Shared business operations: `create_comment`, `update_comment`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-com-0097"></a>
### UC-COM-0097 — Reject empty visible comment

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post without meaningful comment content.

**Expected results**

- Validation preserves draft and prevents empty record.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0130](../features/collaboration.md#uc-com-0130).

Note: Surface correction: Preservation of the native source/draft is separate from service rejection. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0098"></a>
### UC-COM-0098 — Limit visible comment text

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post over 5000 visible Unicode characters.

**Expected results**

- Validation preserves draft.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0131](../features/collaboration.md#uc-com-0131).

Note: Surface correction: Preservation of the native source/draft is separate from service rejection. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0099"></a>
### UC-COM-0099 — Limit comment HTML bytes

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post more than 64 KiB HTML.

**Expected results**

- Validation preserves original source/draft.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:425](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L425), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0132](../features/collaboration.md#uc-com-0132).

Note: Surface correction: Preservation of the native source/draft is separate from service rejection. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0100"></a>
### UC-COM-0100 — Block post with pending uploads

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Post while queued files are unfinished.

**Expected results**

- Finish-upload guidance appears; unsent text remains.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604).

<a id="uc-com-0101"></a>
### UC-COM-0101 — Limit comment picture references

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post over five pictures.

**Expected results**

- Validation prevents publication.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0102"></a>
### UC-COM-0102 — Limit comment file references

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post over twenty file references.

**Expected results**

- Validation prevents publication.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0103"></a>
### UC-COM-0103 — Reject forged source references

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Insert unselected mention/picture/file references through HTML source.

**Expected results**

- Validation requires legitimate selected/uploaded references; source remains.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:425](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L425), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0133](../features/collaboration.md#uc-com-0133).

Note: Surface correction: Preservation of the native source/draft is separate from service rejection. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0104"></a>
### UC-COM-0104 — Suppress remote image fetching

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Render externally sourced image HTML.

**Expected results**

- Rendered content makes no remote image request.

Sources: [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248), [backend/internal/features/issues/description.go:15](../../../backend/internal/features/issues/description.go#L15).

Shared business operations: `create_comment`, `update_issue_v2`.

Related test files: [discussion.spec.ts](../../../frontend/e2e/discussion.spec.ts).

Related cases: [UC-COM-0122](../features/collaboration.md#uc-com-0122), [UC-COM-0123](../features/collaboration.md#uc-com-0123).

Note: Surface correction: Actual suppression of outbound image fetching must be observed in a browser. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0105"></a>
### UC-COM-0105 — Report sanitation changes

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save comment containing removable unsupported markup.

**Expected results**

- Safe HTML and sanitation notices explain accepted changes.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0106"></a>
### UC-COM-0106 — Handle editor loading failure

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Fail editor module loading.

**Expected results**

- Actionable editor-load error appears without silently dropping draft.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108), [frontend/src/app/features/issues/components/description-editor/description-editor.component.ts:102](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.ts#L102).

<a id="uc-com-0107"></a>
### UC-COM-0107 — Open mention from at sign

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type @ at supported mention position.

**Expected results**

- Teammate picker opens with current query.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108), [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

<a id="uc-com-0108"></a>
### UC-COM-0108 — Open mention toolbar control

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Mention a teammate.

**Expected results**

- Picker opens at current insertion position.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

<a id="uc-com-0109"></a>
### UC-COM-0109 — Search mention teammates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type teammate name.

**Expected results**

- Eligible project candidates update live.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

Shared business operations: `list_mention_candidates`.

Related test files: [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-COM-0136](../features/collaboration.md#uc-com-0136).

Note: Surface correction: Live typing and candidate replacement are native mention-picker behavior. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-com-0110"></a>
### UC-COM-0110 — Insert selected mention

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select a candidate.

**Expected results**

- Canonical user identity and display label insert.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26), [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108).

<a id="uc-com-0111"></a>
### UC-COM-0111 — Close mention selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Close teammate selection.

**Expected results**

- Ordinary text stays without invented mention.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

<a id="uc-com-0112"></a>
### UC-COM-0112 — Page mention candidates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Next teammates page.

**Expected results**

- Next eligible candidate page displays.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

Shared business operations: `list_mention_candidates`.

Related cases: [UC-COM-0135](../features/collaboration.md#uc-com-0135).

Note: Surface correction: Replacing the displayed teammate page is client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0113"></a>
### UC-COM-0113 — Keep ordinary at-name text

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type @name without selecting candidate and save.

**Expected results**

- Text remains ordinary text rather than forged selected mention.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:108](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L108), [backend/internal/features/comments/mentions.go:10](../../../backend/internal/features/comments/mentions.go#L10).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-com-0114"></a>
### UC-COM-0114 — Reject newly ineligible mention

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post a newly selected mention after person loses access.

**Expected results**

- Current eligibility rejects new mention without losing draft.

Sources: [backend/internal/features/comments/mentions.go:10](../../../backend/internal/features/comments/mentions.go#L10).

Shared business operations: `create_comment`.

Related test files: [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0134](../features/collaboration.md#uc-com-0134).

Note: Surface correction: Preservation of the native source/draft is separate from service rejection. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0115"></a>
### UC-COM-0115 — Retain previous mention snapshot

Actor: `author` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Edit comment retaining an earlier mentioned user who lost access.

**Expected results**

- Saved label snapshot remains and does not send a new mention notification.

Sources: [backend/internal/features/comments/mentions.go:10](../../../backend/internal/features/comments/mentions.go#L10).

Shared business operations: `update_comment`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

<a id="uc-com-0116"></a>
### UC-COM-0116 — Navigate mention candidates

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Use arrows and Enter in mention combobox.

**Expected results**

- Active candidate and selected user are exposed via accessible option state.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

<a id="uc-com-0117"></a>
### UC-COM-0117 — Escape mention picker

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Press Escape in teammate picker.

**Expected results**

- Picker closes and ordinary text remains.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

<a id="uc-com-0118"></a>
### UC-COM-0118 — Ignore stale mention result

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Let earlier candidate query finish after a newer query.

**Expected results**

- Only latest active query results render.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

Shared business operations: `list_mention_candidates`.

Related test files: [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-COM-0135](../features/collaboration.md#uc-com-0135).

Note: Surface correction: Only the client owns request generations and decides which result renders. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-com-0119"></a>
### UC-COM-0119 — Ignore stale issue discussion

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Switch issue/session while comment request is pending.

**Expected results**

- Previous issue/session result cannot replace new discussion.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45), [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

<a id="uc-com-0120"></a>
### UC-COM-0120 — Read comment after frontend hostname change

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open retained attachment links from old comment after hostname change.

**Expected results**

- ID-based reference uses current application media flow.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Related test files: [unified-assets.spec.ts](../../../frontend/e2e/unified-assets.spec.ts).

<a id="uc-com-0121"></a>
### UC-COM-0121 — Delete comment

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt ordinary comment deletion.

**Expected results**

- No native/service delete-comment action is implemented in current feature registrations.

Sources: [backend/internal/features/comments/mcp.go:11](../../../backend/internal/features/comments/mcp.go#L11), [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Note: Version retention/edit is implemented; deletion is a separate absent capability.

<a id="uc-com-0122"></a>
### UC-COM-0122 — Sanitize stored description HTML at service boundary

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Description editor is open and editable.

**Steps**

1. Save a description containing executable markup.

**Expected results**

- The accepted stored/returned description removes script, event-handler, iframe and unsafe SVG content.

Sources: [frontend/src/app/features/issues/components/description-editor/description-editor.component.html:1](../../../frontend/src/app/features/issues/components/description-editor/description-editor.component.html#L1), [backend/internal/features/issues/description.go:15](../../../backend/internal/features/issues/description.go#L15).

Shared business operations: `update_issue_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-COM-0029](../features/collaboration.md#uc-com-0029).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0029. Its browser behavior remains in the original stable case.

<a id="uc-com-0123"></a>
### UC-COM-0123 — Sanitize stored comment HTML at service boundary

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Comment editor is open and editable.

**Steps**

1. Create or update a comment containing executable markup.

**Expected results**

- The accepted safe HTML removes executable tags and event attributes while retaining allowed visible content.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html:1](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.html#L1), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`, `update_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0059](../features/collaboration.md#uc-com-0059).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0059. Its browser behavior remains in the original stable case.

<a id="uc-com-0124"></a>
### UC-COM-0124 — Read current first comment page and total

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read the first comment page after another accepted comment.

**Expected results**

- The page contains the current oldest-first records and the current total without duplicating a comment.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0074](../features/collaboration.md#uc-com-0074).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0074. Its browser behavior remains in the original stable case.

<a id="uc-com-0125"></a>
### UC-COM-0125 — Read successive comment cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a bounded comment page, then its next cursor.

**Expected results**

- Successive oldest-first pages have distinct comment IDs and together contain the expected records.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0075](../features/collaboration.md#uc-com-0075).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0075. Its browser behavior remains in the original stable case.

<a id="uc-com-0126"></a>
### UC-COM-0126 — Retain accepted own-comment edit revision

Actor: `author` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Update an owned comment using its current revision.

**Expected results**

- Exactly one next revision is retained with updated safe HTML, revision and edited timestamp.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327), [backend/internal/features/comments/service.go:81](../../../backend/internal/features/comments/service.go#L81).

Shared business operations: `update_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0082](../features/collaboration.md#uc-com-0082).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0082. Its browser behavior remains in the original stable case.

<a id="uc-com-0127"></a>
### UC-COM-0127 — Read successive retained comment version pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a bounded retained-version page, then its next cursor.

**Expected results**

- Distinct immutable versions are returned in documented oldest-first order.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comment_versions`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0086](../features/collaboration.md#uc-com-0086).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0086. Its browser behavior remains in the original stable case.

<a id="uc-com-0128"></a>
### UC-COM-0128 — Reject stale comment edit with current revision

Actor: `author` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is the comment author with current project write access unless the case checks lost access.

**Steps**

1. Update a comment using an outdated revision.

**Expected results**

- The conflict identifies the current comment and creates no extra retained revision.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:327](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L327).

Shared business operations: `update_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0088](../features/collaboration.md#uc-com-0088).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0088. Its browser behavior remains in the original stable case.

<a id="uc-com-0129"></a>
### UC-COM-0129 — Deny comment reads after access revocation

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read comments after current project read access is removed.

**Expected results**

- The unavailable/forbidden result returns no private discussion records.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Shared business operations: `list_comments`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-COM-0093](../features/collaboration.md#uc-com-0093).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0093. Its browser behavior remains in the original stable case.

<a id="uc-com-0130"></a>
### UC-COM-0130 — Reject empty comment at service boundary

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post a comment without meaningful visible content.

**Expected results**

- Validation rejects the empty comment without creating a record.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0097](../features/collaboration.md#uc-com-0097).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0097. Its browser behavior remains in the original stable case.

<a id="uc-com-0131"></a>
### UC-COM-0131 — Enforce service comment Unicode text limit

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post more than 5000 visible Unicode characters.

**Expected results**

- Validation rejects the comment without creating a record.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:604](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L604), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0098](../features/collaboration.md#uc-com-0098).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0098. Its browser behavior remains in the original stable case.

<a id="uc-com-0132"></a>
### UC-COM-0132 — Enforce service comment HTML byte limit

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post more than 64 KiB of HTML.

**Expected results**

- Validation rejects the HTML without creating a record.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:425](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L425), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0099](../features/collaboration.md#uc-com-0099).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0099. Its browser behavior remains in the original stable case.

<a id="uc-com-0133"></a>
### UC-COM-0133 — Reject forged comment reference body

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post HTML and explicit reference IDs that are not legitimate current-scope references.

**Expected results**

- Current scope/ownership/reference validation rejects publication.

Sources: [frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts:425](../../../frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts#L425), [backend/internal/features/comments/html.go:248](../../../backend/internal/features/comments/html.go#L248).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-COM-0103](../features/collaboration.md#uc-com-0103).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0103. Its browser behavior remains in the original stable case.

<a id="uc-com-0134"></a>
### UC-COM-0134 — Reject newly ineligible mention at service boundary

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Post a newly referenced person after that person loses current eligibility.

**Expected results**

- The new mention is rejected without publishing a comment or new mention notification.

Sources: [backend/internal/features/comments/mentions.go:10](../../../backend/internal/features/comments/mentions.go#L10).

Shared business operations: `create_comment`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-COM-0114](../features/collaboration.md#uc-com-0114).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0114. Its browser behavior remains in the original stable case.

<a id="uc-com-0135"></a>
### UC-COM-0135 — Read eligible mention candidate cursor pages

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read a scoped candidate page and its next cursor.

**Expected results**

- Each page returns eligible matching people; advancing reaches later distinct people.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

Shared business operations: `list_mention_candidates`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-COM-0112](../features/collaboration.md#uc-com-0112).

Note: Atomic service outcome separated from the native UI behavior in UC-COM-0112. Its browser behavior remains in the original stable case.

<a id="uc-com-0136"></a>
### UC-COM-0136 — Read matching eligible mention candidates

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Query mention candidates within the current project.

**Expected results**

- Matching currently eligible project people are returned and foreign/ineligible people are excluded.

Sources: [frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts:26](../../../frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts#L26).

Shared business operations: `list_mention_candidates`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-COM-0109](../features/collaboration.md#uc-com-0109).

Note: Atomic service outcome separated from native UI case UC-COM-0109.

<a id="uc-com-0137"></a>
### UC-COM-0137 — Omit editing controls on another author comment

Actor: `company_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A member-authored comment exists and an administrator can read its project.

**Steps**

1. Open the issue as the administrator and click the other author displayed comment.

**Expected results**

- The retained comment and history remain readable; Edit comment and inline editor controls are absent and the original content is unchanged.

Sources: [frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts:45](../../../frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts#L45).

Related test files: [coverage-native-comment-extra.spec.ts](../../../frontend/e2e/coverage-native-comment-extra.spec.ts).

Related cases: [UC-COM-0094](../features/collaboration.md#uc-com-0094).

Note: Atomic native control boundary distinct from direct author-only REST/MCP mutation rejection.
