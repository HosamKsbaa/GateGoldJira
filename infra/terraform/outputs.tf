output "backend_origin" { value = var.backend_origin }
output "service_uri" { value = try(google_cloud_run_v2_service.backend[0].uri, null) }
output "database_connection" { value = google_sql_database_instance.database.connection_name }
output "runtime_database_user" { value = google_sql_user.identities["runtime"].name }
output "migration_database_user" { value = google_sql_user.identities["migration"].name }
output "registry" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}" }
output "cursor_secret" { value = google_secret_manager_secret.cursor.id }
output "picture_buckets" { value = { for kind, bucket in google_storage_bucket.pictures : kind => bucket.name } }
output "maintenance_identity" { value = google_service_account.identities["maintenance"].email }
