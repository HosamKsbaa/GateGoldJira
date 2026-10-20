mock_provider "google" {}
variables {
  project_id      = "gategoldjira-fixture"
  backend_image   = "europe-west1-docker.pkg.dev/gategoldjira-fixture/test/backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  backend_origin  = "https://gategoldjira-test.example.test"
  frontend_origin = "https://gategoldjira-fixture.web.app"
  auth_issuer     = "https://fixture.eu.auth0.com/"
}
run "prepare_without_backend" {
  command = plan
  assert {
    condition     = length(google_cloud_run_v2_service.backend) == 0
    error_message = "Do not start an unbootstrapped backend."
  }
  assert {
    condition     = google_sql_database_instance.database.settings[0].disk_autoresize_limit == 50 && google_sql_database_instance.database.database_version == "POSTGRES_18"
    error_message = "Preserve the bounded PostgreSQL18 candidate."
  }
  assert {
    condition     = !contains(google_project_iam_custom_role.published.permissions, "storage.objects.delete") && google_storage_bucket.pictures["published"].soft_delete_policy[0].retention_duration_seconds == 2592000
    error_message = "Runtime must retain immutable published pictures."
  }
}
run "enabled_candidate" {
  command = plan
  variables { backend_enabled = true }
  assert {
    condition     = google_cloud_run_v2_service.backend[0].template[0].max_instance_request_concurrency == 40 && google_cloud_run_v2_service.backend[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.backend[0].scaling[0].max_instance_count == 2 && google_cloud_run_v2_service.backend[0].template[0].containers[0].resources[0].cpu_idle
    error_message = "Preserve request billing and bounded min0/max2 scale."
  }
  assert {
    condition     = google_cloud_scheduler_job.draft_cleanup[0].http_target[0].oidc_token[0].audience == "https://gategoldjira-test.example.test/internal/maintenance/pictures"
    error_message = "Cleanup tokens must use the exact maintenance audience."
  }
  assert {
    condition     = google_cloud_scheduler_job.draft_cleanup[0].schedule == "*/5 * * * *" && length(google_secret_manager_secret.smtp_password) == 0 && alltrue([for entry in google_cloud_run_v2_service.backend[0].template[0].containers[0].env : !startswith(entry.name, "SMTP_")])
    error_message = "Reuse five-minute maintenance and keep email disabled by default."
  }
  assert {
    condition     = one([for entry in google_cloud_run_v2_service.backend[0].template[0].containers[0].env : entry.value if entry.name == "NOTIFICATION_APP_URL"]) == var.frontend_origin
    error_message = "Notification links must use the configured frontend origin."
  }
  assert {
    condition     = google_sql_database_instance.database.settings[0].backup_configuration[0].transaction_log_retention_days == 7 && google_sql_database_instance.database.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 30
    error_message = "Keep PITR7 and daily30 backups."
  }
}

run "optional_smtp_secret_reference" {
  command = plan
  variables {
    backend_enabled              = true
    smtp_address                 = "smtp.fixture.test:587"
    smtp_from                    = "jira@fixture.test"
    smtp_username                = "fixture-account"
    smtp_password_secret_version = "2"
  }
  assert {
    condition     = length(google_secret_manager_secret.smtp_password) == 1 && one([for entry in google_cloud_run_v2_service.backend[0].template[0].containers[0].env : entry.value_source[0].secret_key_ref[0].version if entry.name == "SMTP_PASSWORD"]) == "2"
    error_message = "SMTP credentials must use the pinned backend-only Secret Manager version."
  }
}
run "separate_migration_job" {
  command = plan
  variables {
    migration_job_enabled = true
  }
  assert {
    condition = google_cloud_run_v2_job.migration[0].template[0].template[0].max_retries == 0 && google_cloud_run_v2_job.migration[0].template[0].template[0].containers[0].args == tolist(["migrate"])
    error_message = "Migrations must run separately with no automatic retries."
  }
  assert {
    condition = contains(google_project_iam_custom_role.staging.permissions,"storage.objects.update") && !contains(google_project_iam_custom_role.published.permissions,"storage.objects.update")
    error_message = "Only staging permits checksum metadata updates."
  }
}

run "named_revision_canary" {
  command = plan
  variables {
    backend_enabled = true
    backend_revision_name = "gategoldjira-test-backend-new"
    backend_traffic = { "gategoldjira-test-backend-old" = 95, "gategoldjira-test-backend-new" = 5 }
  }
  assert {
    condition = length(google_cloud_run_v2_service.backend[0].traffic)==2 && alltrue([for traffic in google_cloud_run_v2_service.backend[0].traffic : traffic.type=="TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"])
    error_message = "A reviewed canary must pin named old/new revisions rather than send all traffic to latest."
  }
}
