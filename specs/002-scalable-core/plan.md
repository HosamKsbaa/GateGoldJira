# Implementation Plan: Scalable GateGoldJira Core

**Branch**: `main` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

Implement the reviewed V2 through expand → bridge → backfill → switch → retire. Start with search and prior-value field patches, which improve daily use without a destructive schema change. Introduce lifecycle guards across existing writers before opting individual commands into narrower locks. Canonical configuration and normalized issue references precede independent boards, fields/approvals and media consolidation. Preserve existing runtime data and old retry identities.

## Technical Context

- **Language/version**: existing pinned Go 1.27.2, TypeScript 6.0.3 and Angular 22.2.2.
- **Dependencies**: existing Huma 2.39.1, pgx 5.11.0/sqlc 1.31.1, Goose 3.28.0, official MCP Go SDK 1.8.0, Tiptap/CDK; no upgrades.
- **Storage**: PostgreSQL 18.6 and existing private object-store boundary; local fixtures stay local.
- **Testing**: Go unit/real PostgreSQL/race/vet, generated contracts, strict Angular/templates/tests, Vitest, Playwright and workload probes.
- **Platform**: separate Angular SPA and one feature-organized Go REST/MCP app; existing Firebase/Cloud Run/Cloud SQL/GCS deployment arrangement.
- **Performance**: release p95 read/write 500/750 ms; common-action stretch 200/300 ms; warm browser 2 s and hosted idle-start 5 s. Measure actual prepared query paths, pool/lock waits and competing writes.
- **Scope**: 44 target application tables; 100k-issue/100-active-user local load plus hot-project cases. Growth tests identify limits; external acceptance remains independently pending.

## Constitution Check

Pre-research and post-design: PASS. Explicit Go models, strict generated TypeScript, boundary validation and checked stored values; independent apps; one backend/database and feature-owned SQL; shared REST/MCP rules; additive guarded migrations; bounded queries/queues/pools; no unmeasured extra infrastructure. No exceptions or framework additions. Existing external authentication/cloud/restore gates remain honestly pending.

## Project Structure

Documentation is under `specs/002-scalable-core/`, preserving `001-gategoldjira-mvp/`.

```text
backend/db/migrations/                 additive expansion and explicit retirement
backend/internal/features/issues/     search, field patches, normalized core and commands
backend/internal/features/configuration/ workflows, bindings, taxonomy and typed fields
backend/internal/features/boards/     independent layout, cursors, ranks and WIP
backend/internal/features/attachments/ unified assets/sessions, validators and media adapters
backend/internal/features/projects/   project administrator and creation/default setup
backend/internal/platform/command/    named IDs, operation contracts and guard protocol
backend/internal/platform/database/   generated queries and measured connection settings
backend/internal/platform/objectstore/ existing concrete private storage boundary
frontend/src/app/features/            same feature-first layout and generated client
backend/tests/                       populated migration, parity, race and load cases
frontend/e2e/                        daily-use, configuration, grouped-board and file scenarios
```

## Delivery and compatibility

1. Preserve a private migration-00010 backup and baseline. Existing tests create their own databases; no reseeding the user's project.
2. Add typed search classification and escaped literal ILIKE, changing issue and board predicates together. Retain old exact totals; count-free live search uses an explicit new contract.
3. Add assignee/priority/date field patches with prior-value CAS and unchanged-save behavior. Keep legacy PUT revision checks. Ship the guarded field path before changing project lock scope.
4. Expand canonical configuration, issue identifiers, column mappings, field/approval and asset/session structures in additive migrations. Preflight divergent board workflows and cross-table asset/retry collisions. Validated intersection reconciliation preserves current move restrictions; impossible/ambiguous reconciliation is reported rather than guessed.
5. Introduce one lifecycle advisory protocol: legacy mutations remain exclusive while every participant joins it. Opt only individually verified metadata operations into shared lifecycle + focused row locks. Preserve graph/order/WIP guards until equivalent race tests pass.
6. Bridge old mutations/readers and backfill bounded batches before making normalized columns required. Representation backfill preserves content revisions, timestamps and historical text snapshots. Drain incompatible old backend revisions before cutover.
7. Expose versioned identifier-based REST/MCP contracts and switch the first-party client. Old operations continue only on representable configuration; project modern-mode is explicit. Old editors cannot round-trip grouped columns/custom taxonomy and receive upgrade guidance, never a lossy approximation.
8. Add fields/approvals/roles and hard WIP only after every affected mutation path participates. Keep ordinary warning views unrestricted.
9. Consolidate media behind current URLs and HTML markers before enabling document drafts/resumable sessions. Transfer outside business locks; verify generations/checksums and finalize short transactions.
10. Compare full old/new behavior on populated fixtures, regenerate clients, run mixed workloads and migrate preserved local data. Retire legacy storage only after references/consumers are gone; record tested forward-repair/rollback boundaries. External cloud/provider checks cannot be inferred locally.

## Execution policy

Tasks remain ordered and independently verifiable. Failed sequential checks are repaired before the next slice. Each completed task is marked only after its relevant check passes. Research agents were read-only and requested by Spec Kit Phase 0; implementation remains sequential in this checkout.

### Configuration delivery dependency

Configuration UI can prepare custom types/priorities while old fixed-choice issue access remains active. Activation of custom issue choices and changed creation defaults ships with the identifier-based issue contract in US3 (T022–T023). The configuration foundation tests its compatibility gate; full US2 usage acceptance is closed only after that integration. This avoids asking old fixed-enum clients to round-trip new taxonomy values.

## Modern client completion and 200k correction

The 2026-10-15 follow-up retains the same 44-table model and pinned stack. Native bulk and private saved-search components use existing issue services; saved category filters keep original meaning while native results retain exact IDs. Project-mode activation is a new explicit administrator readiness/save pair, guarded by current project/configuration/default-board revisions and the shared lifecycle protocol. Supported legacy retry decoding remains active after the switch.

The measured broad-board bottleneck is exact counting, not card paging. A compact partial project/stage index and per-mapped-stage counts preserve one-snapshot exact totals without new mutable state. Validate the actual generated prepared queries and repeat 200k/100-user, 100k prepared/selectivity/rank-tail and large-media workloads before local adoption. New native UI and activation tests join the complete browser/REST/MCP/race suite; external acceptance remains separately pending.

## Code quality follow-up

The 2026-10-16 corrections keep the pinned stack and canonical schema. A narrow route reuse policy recreates project-scoped administrative editors when their project parameter changes, preserving normal same-project reuse and router deactivation/access guards. Bulk targets are scoped to their project/workflow and current loaded choices; uncertain retries retain accepted intent. The Make migration entry invokes the existing guarded owner CLI. A separate CI job runs the existing isolated browser runner with Chromium and its own Compose database; private identities/traces are not uploaded. Regression cases precede final full acceptance.
