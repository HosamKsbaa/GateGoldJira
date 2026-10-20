# Hosting and recurring cost review

Status as of2026-10-12: candidate infrastructure is prepared and validated with credential-free mock plans. No account, credit balance/expiry, region-selected calculator export, actual Cloud plan or Auth0 workforce entitlement has been inspected. These are external release gates, not completed verification.

## Account record

| Item | Current evidence / required action |
| --- | --- |
| Benefit | User identified `$200 Google Cloud credit`; confirm the actual promotional offer ID |
| Billing account/project | Pending selected isolated project linked to eligible billing account |
| Remaining credit / expiry | Pending Billing Credits page and promotion terms; do not infer from initial grant |
| SKU eligibility | Pending terms for Cloud SQL, Cloud Run, GCS, registry, Scheduler, Monitoring and Firebase Hosting |
| Currency/tax | Pending account currency and applicable taxes; worksheet below is pre-tax USD |
| Auth0 internal employee use | Pending tenant owner/plan confirmation; Google social/workforce connection, API resource profile, public/native clients and Action support |
| Gross-cost alert channels | Pending actual channels; Terraform excludes all credits from budget costs, but no messages have been sent |

Record remaining balance/expiry/eligible products from [Google Billing credit information](https://docs.cloud.google.com/billing/docs/how-to/resolve-issues#view_promotional_credits). Promotions are temporary account credits; they do not reduce recurring gross usage. Auth0 is a separate supplier whose pricing and workforce eligibility need separate confirmation in [Auth0 pricing](https://auth0.com/pricing).

## Worksheet to finish with region-selected SKUs

Use730hours/month, europe-west1, PostgreSQL18 Enterprise single zone,10GiBSSD, daily30/PITR7/final30, actual retained backup size,1GiB published pictures initially, actual traffic/log/registry retention and no commitments. Cloud SQL prices depend on edition, region, tier, storage, backup and networking; export the actual chosen region from the [Cloud SQL calculator/prices](https://cloud.google.com/sql/pricing). Do not use the extended-support db-g1-small line as the instance price for supported PostgreSQL18.

| Component | Formula / value to verify |
| --- | --- |
| Shared SQL |730×regional db-g1-small hourly rate; original assumption `$0.035/h` gives `$25.55` |
| Dedicated alternative |730×(1vCPU rate +3.75GiB memory rate); replace original approximation after calculator export |
| SSD |10×regional SSD GiB-month rate; original `$0.17` assumption gives `$1.70`; growth to50GiB raises this |
| Backups/PITR/final backup |Actual retained GiB×regional backup rate; include logs and retained deleted-instance backups |
| Run min0 |Active CPU seconds×regional rate +GiB-seconds×rate +requests/egress; apply remaining shared free allowance separately |
| Run min1 |Add idle CPU and memory seconds; Tier1 illustrative1vCPU/1GiB fully idle730h at `$0.0000025` each is `$13.14` before free allowance |
| GCS |Published/staging/soft-deleted GiB +classA/B operations +actual private download transfer |
| Frontend |Stored versions +daily CDN bytes above allowance; preview storage counts |
| Other |Registry retained images, Scheduler job, secrets, logs/Monitoring and temporary migration/restore/load resources |
| Auth0 |Confirmed employee/license/client entitlement; not included in Google usage |

Cloud Run's request-based free allowance is aggregated by billing account; region affects rates. Do not assume other projects leave all free quota available. [Cloud Run prices](https://cloud.google.com/run/pricing). Firebase Hosting lists10GB no-cost storage and360MB/day no-cost transfer, then paid Blaze usage; monitor daily traffic and retained versions. [Firebase Hosting usage](https://firebase.google.com/docs/hosting/usage-quotas-pricing).

The original planning envelopes remain **unverified assumptions**: min0/shared `$32–46/month`, min1/shared `$45–60`, min0/dedicated `$56–70`. They are not a quote, a spending cap or measured cloud performance. Reforecast from the actual account/region before selecting an alternative. At those hypothetical rates, `$200/rate` is roughly4.3–6.3months for min0/shared only if all relevant usage is eligible and the credit has not expired. External Auth0/tax/extra services reduce that duration.

Candidate remains min0/shared until actual workload measurements justify and cost-review min1 or dedicated SQL. Max2 is a capacity control, not a guaranteed bill cap; backup/storage growth and test resources also cost money. Terraform prepares50/90/100% gross-cost thresholds and memory/latency/connection alerts. Avoid a VPC connector, load balancer or paid always-on frontend unless an observed requirement calls for one.
