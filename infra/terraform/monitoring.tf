data "google_project" "target" {
  project_id = var.project_id
}
resource "google_billing_budget" "gross" {
  count           = var.billing_account == null ? 0 : 1
  billing_account = var.billing_account
  display_name    = "${var.name} gross monthly cost (before credits)"
  budget_filter {
    projects               = ["projects/${data.google_project.target.number}"]
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }
}
locals {
  metric_alerts = {
    run_memory      = { metric = "run.googleapis.com/container/memory/utilizations", resource = "cloud_run_revision", aligner = "ALIGN_PERCENTILE_95", threshold = 0.8 }
    sql_memory      = { metric = "cloudsql.googleapis.com/database/memory/utilization", resource = "cloudsql_database", aligner = "ALIGN_MEAN", threshold = 0.85 }
    sql_connections = { metric = "cloudsql.googleapis.com/database/postgresql/num_backends", resource = "cloudsql_database", aligner = "ALIGN_MAX", threshold = 70 }
    run_latency     = { metric = "run.googleapis.com/request_latencies", resource = "cloud_run_revision", aligner = "ALIGN_PERCENTILE_95", threshold = 750 }
  }
}
resource "google_monitoring_alert_policy" "capacity" {
  for_each              = local.metric_alerts
  display_name          = "${var.name}: ${each.key}"
  combiner              = "OR"
  notification_channels = var.notification_channels
  documentation {
    content   = "Check the isolated GateGoldJira performance run and metadata-only logs. Investigate lock/pool delay, ordinary read500ms/write750ms, memory and temporary extra instances before changing tiers. No issue/comment text is logged."
    mime_type = "text/markdown"
  }
  conditions {
    display_name = each.key
    condition_threshold {
      filter          = "resource.type = \"${each.value.resource}\" AND metric.type = \"${each.value.metric}\" AND resource.labels.project_id = \"${var.project_id}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = each.value.aligner
      }
      trigger { count = 1 }
    }
  }
  depends_on = [google_project_service.apis]
}
