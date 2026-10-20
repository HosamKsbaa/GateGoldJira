resource "google_cloud_scheduler_job" "draft_cleanup" {
  count            = var.backend_enabled ? 1 : 0
  name             = "${var.name}-draft-cleanup"
  region           = var.region
  description      = "Run bounded notifications/reminders and expire SQL-confirmed private drafts. Published objects are retained."
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "40s"
  retry_config {
    retry_count          = 2
    min_backoff_duration = "10s"
    max_backoff_duration = "60s"
  }
  http_target {
    uri         = local.maintenance_url
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.identities["maintenance"].email
      audience              = local.maintenance_url
    }
  }
  depends_on = [google_cloud_run_v2_service.backend]
}
