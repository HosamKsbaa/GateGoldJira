locals {
  services        = toset(["run.googleapis.com", "sqladmin.googleapis.com", "storage.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com", "monitoring.googleapis.com", "logging.googleapis.com", "cloudbilling.googleapis.com", "cloudresourcemanager.googleapis.com", "billingbudgets.googleapis.com", "iam.googleapis.com"])
  labels          = { application = "gategoldjira", environment = "isolated-test" }
  maintenance_url = "${var.backend_origin}/internal/maintenance/pictures"
}
resource "google_project_service" "apis" {
  for_each           = local.services
  service            = each.key
  disable_on_destroy = false
}
resource "google_artifact_registry_repository" "backend" {
  location      = var.region
  repository_id = "${var.name}-backend"
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.apis]
}
resource "google_sql_database_instance" "database" {
  name                = "${var.name}-postgres"
  region              = var.region
  database_version    = "POSTGRES_18"
  deletion_protection = true
  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    disk_autoresize_limit       = 50
    deletion_protection_enabled = true
    connector_enforcement       = "REQUIRED"
    retain_backups_on_delete    = true
    user_labels                 = local.labels
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    ip_configuration {
      ipv4_enabled = true
      # No authorized networks. Only the encrypted IAM connector can connect.
    }
    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      location                       = var.region
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }
    final_backup_config {
      enabled        = true
      retention_days = 30
    }
    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_sql_database" "application" {
  name     = "gategoldjira"
  instance = google_sql_database_instance.database.name
}
resource "google_storage_bucket" "pictures" {
  for_each                    = toset(["staging", "published"])
  name                        = "${var.project_id}-${var.name}-${each.key}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  soft_delete_policy {
    retention_duration_seconds = each.key == "published" ? 2592000 : 0
  }
  # Application cleanup uses SQL references and generations, never a blind
  # bucket-age deletion policy. Published objects have no delete IAM grant.
  depends_on = [google_project_service.apis]
}
resource "google_cloud_run_v2_service" "backend" {
  count               = var.backend_enabled ? 1 : 0
  name                = "${var.name}-backend"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true
  labels              = local.labels
  scaling {
    min_instance_count = var.min_instances
    max_instance_count = 2
  }
  template {
    revision                         = var.backend_revision_name
    service_account                  = google_service_account.identities["runtime"].email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 40
    timeout                          = "60s"
    containers {
      image = var.backend_image
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      ports { container_port = 8080 }
      dynamic "env" {
        for_each = merge({
          APP_ENV                    = "production", AUTH_MODE = "oidc", STORAGE_MODE = "gcs", COMPANY_TIMEZONE = "Africa/Cairo",
          CLOUD_SQL_INSTANCE         = google_sql_database_instance.database.connection_name,
          DATABASE_URL               = "postgres://${google_sql_user.identities["runtime"].name}@localhost/gategoldjira?sslmode=disable",
          AUTH_ISSUER                = var.auth_issuer, REST_AUDIENCE = "${var.backend_origin}/api", MCP_AUDIENCE = "${var.backend_origin}/mcp",
          MCP_BROWSER_OAUTH_ENABLED  = tostring(var.mcp_browser_oauth_enabled),
          AUTH_REQUIRED_SCOPE        = "gategoldjira:access", ALLOWED_ORIGINS = var.frontend_origin, NOTIFICATION_APP_URL = var.frontend_origin,
          STAGING_BUCKET             = google_storage_bucket.pictures["staging"].name, PUBLISHED_BUCKET = google_storage_bucket.pictures["published"].name,
          CURSOR_SECRET_FILE         = "/var/secrets/cursor/key", MAINTENANCE_AUDIENCE = local.maintenance_url,
          MAINTENANCE_SERVICE_EMAILS = google_service_account.identities["maintenance"].email
        }, var.smtp_address == null ? {} : { SMTP_ADDRESS = var.smtp_address, SMTP_FROM = var.smtp_from }, var.smtp_username == null ? {} : { SMTP_USERNAME = var.smtp_username })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.smtp_username == null ? [] : [1]
        content {
          name = "SMTP_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.smtp_password[0].secret_id
              version = var.smtp_password_secret_version
            }
          }
        }
      }
      volume_mounts {
        name       = "cursor"
        mount_path = "/var/secrets/cursor"
      }
      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 2
        timeout_seconds       = 1
        failure_threshold     = 15
        http_get { path = "/readyz" }
      }
    }
    volumes {
      name = "cursor"
      secret {
        secret = google_secret_manager_secret.cursor.secret_id
        items {
          version = var.cursor_secret_version
          path    = "key"
        }
      }
    }
  }
  dynamic "traffic" {
    # Empty only for initial creation. Subsequent releases pin named revisions
    # so an image/template update cannot silently receive all live traffic.
    for_each = length(var.backend_traffic) == 0 ? { latest = { type = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", revision = null, percent = 100 } } : { for revision, percent in var.backend_traffic : revision => { type = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision = revision, percent = percent } }
    content {
      type     = traffic.value.type
      revision = traffic.value.revision
      percent  = traffic.value.percent
    }
  }
  depends_on = [google_project_iam_member.database, google_secret_manager_secret_iam_member.cursor, google_secret_manager_secret_iam_member.smtp_password, google_storage_bucket_iam_member.staging, google_storage_bucket_iam_member.published]
}
# OAuth human access is authenticated by the Go application's REST/MCP verifier.
# The maintenance route separately checks Google's exact OIDC audience and email.
resource "google_cloud_run_v2_service_iam_member" "human_transport" {
  count    = var.backend_enabled ? 1 : 0
  name     = google_cloud_run_v2_service.backend[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
