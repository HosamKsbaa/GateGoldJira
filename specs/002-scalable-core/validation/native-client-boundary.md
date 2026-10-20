# Native client and administrative activation

Canonical storage serves every project. The current first-party issue list, detail and board routes use the native client for all projects. A canonical write can promote a legacy project to modern mode; explicit administrator activation remains available with readiness review. Neither path reseeds issues, comments, files, ranks or accepted retry results. The earlier October 15 promise that every existing project waits for explicit activation no longer describes the current application.

## Completed native controls

The native issue list supports live numeric/key/title/Arabic search, scoped choices, assignee lookup, dates/overdue, labels, parent and prerequisite filters, sorting, pagination and creation. Saved searches support private create/apply/update/rename/remove. Multi-value and hidden predicates remain exact when applied; editing one control changes only that predicate, and renaming preserves the stored filter.

Bulk actions support up to 100 selected issues from one project: assignee, priority, due date, stage, archive, restore, move to backlog and add to board. Field saves compare the selected field's previous value so unrelated edits can merge. Stage moves enforce workflow/revision/completion/approval rules; selecting issues from multiple workflows requires separate stage batches. Each issue saves independently, and failures remain selected for explicit review. Uncertain results preserve the exact request and retry reference across in-app navigation. Leaving an active batch stops work that has not been submitted. Drafts remain in memory and clear on sign-out or reload.

Planning, backlog, CSV import/export, assignment rules, independent boards, typed fields, contextual approvals, rich descriptions/comments and unified attachments retain their existing dedicated screens and shared canonical services. Compatibility API fixture creation remains supported while the project is in legacy mode; the former compatibility issue editor is no longer a first-party route.

## Safe administrative activation

Open **Project → Issue configuration → New issue mode → Review activation**. The review checks active creation defaults, eligible initial workflows, completion paths, complete canonical references and default-board coverage of open and occupied stages. The default board must be active and unfiltered. A bounded review rejects configurations exceeding 1,000 active/occupied workflows.

Only a current company/project administrator can review or activate. The administrator must explicitly confirm the current review; configuration, project and default-board identities/revisions are checked again under lifecycle guards. Stale reviews require a new review. Accepted activation is idempotent and keeps the same result on retry, including after navigation or a lost acknowledgement; current revocation still applies. REST and MCP use the same service and contract. Activation changes project mode, revisions and one audit event, without rewriting existing work.

There is no public downgrade endpoint. Do not change a production project back to legacy mode after creating native-only configuration without a separate reviewed compatibility design. The code-quality corrections do not migrate or activate the existing company; subsequent canonical writes follow the current application's automatic promotion behavior.

## Verification boundary

The browser runner uses only disposable databases matching `gg_browser_[0-9a-f]{32}`. Each compatibility scenario resets only its disposable Demo project's mode before seeding through V1 and exercising the native UI. Native activation scenarios use independent projects and public readiness/activation. This fixture reset is never used on the live company. Acceptance covers exact saved filters and privacy, conflict review, all bulk actions, role denial, selected-field conflicts, lost acknowledgement retries, navigation recovery and delayed startup responses. [Final verification](final-verification.md) records dated verification and adoption results; [readiness](readiness.md) records external acceptance limits.
