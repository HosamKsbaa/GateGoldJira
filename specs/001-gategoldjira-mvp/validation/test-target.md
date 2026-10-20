# Isolated target preparation

Status: local artifacts prepared; no external target authorized/configured or provisioned. Auth0 tenant/client IDs, Google project/billing account, frontend site, approved employee identities and assistant registration remain unavailable. The user selected local work. Mocked Terraform plans do not constitute a real Cloud plan.

Run `bash scripts/prepare-test-target.sh` for provider-schema validation and credential-free plans. With an explicitly selected isolated project, `bash scripts/prepare-test-target.sh /absolute/target.tfvars` saves the actual provider plan in ignored `.local/cloud-review/`. Keep plans/state private. Review creation, estimated gross costs, exact service URLs and identities before any apply. Do not set backend_enabled until the database, grants and secret are bootstrapped. migration_job_enabled permits job preparation independently; it does not execute it.

Review packet:

| Input/artifact | Required evidence |
| --- | --- |
| Google project + billing | Owner authorization; credit/SKU/expiry worksheet; no company production data |
| Terraform | Locked CLI/provider; real saved plan; europe-west1; min0/max2; SQL18/shared1.7GiB; deletion protection; daily30/PITR7/final30 |
| Backend | Binary manifest and pushed immutable container digest; separate migration job uses identical image |
| Identity | `identity/auth0/README.md`; compiled `dist/actions/verified-email-action.cjs`; public SPA/native clients; exact callbacks; separate REST/MCP audiences; Google connection; disabled DCR; workforce entitlement |
| Storage | Separate private staging/published buckets; runtime cannot delete published objects |
| Database | IAM users; admin applies bootstrap-roles.sql; separate migration job runs `migrate`; schema owner applies runtime-grants.sql; runtime has no DDL/history rewrite privilege |
| Runtime | Secret Manager cursor version pinned; HTTPS origin/CORS; Google maintenance audience/email; startup readiness |
| Frontend | Generated independent artifact manifest/CSP; isolated Firebase preview URL; production publication remains distinct |
| Fixtures | Explicit test employee approval; full-scale seed in a disposable target only; redacted tokens never in reports |

Execution order after target approval: provision reviewed infrastructure with backend disabled; push image; add cursor secret outside Terraform state; bootstrap IAM schema owner; enable/execute migration job; apply runtime grants and connection limits (runtime pool10×max2 plus migration/admin headroom); bootstrap first approved Admin through an audited operator session; configure managed OAuth; enable backend; deploy separate frontend preview. Verify `/healthz`, `/readyz`, resource/issuer discovery, S256 human login, audiences, current permissions, maintenance identity and backup availability. Record URLs, actual revisions/digests, region, SQL tier, 50 users and browser/network details. Then collect assistant/usability/load/restore evidence. Never seed a production database.

The initial default Cloud Run URL must be obtained during isolated service setup and installed as the exact audience/origin in Go, Auth0 and frontend public config. An example `.test` origin is not a working deployment. Re-plan the explicit final origin before exposing preview access.
