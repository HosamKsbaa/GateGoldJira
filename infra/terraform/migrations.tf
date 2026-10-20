resource "google_cloud_run_v2_job" "migration" {
  count               = var.migration_job_enabled ? 1 : 0
  name                = "${var.name}-migrate"
  location            = var.region
  deletion_protection = true
  template {
    parallelism = 1
    task_count  = 1
    template {
      service_account = google_service_account.identities["migration"].email
      timeout         = "300s"
      max_retries     = 0
      containers {
        image = var.backend_image
        args  = ["migrate"]
        resources { limits = { cpu = "1", memory = "512Mi" } }
        env {
          name  = "APP_ENV"
          value = "production"
        }
        env {
          name  = "CLOUD_SQL_INSTANCE"
          value = google_sql_database_instance.database.connection_name
        }
        env {
          name  = "DATABASE_URL"
          value = "postgres://${google_sql_user.identities["migration"].name}@localhost/gategoldjira?sslmode=disable"
        }
      }
    }
  }
  depends_on = [google_project_iam_member.database]
}
