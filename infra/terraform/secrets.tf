# Secret values never enter Terraform state, plans or browser configuration.
# The operator adds >=32 random bytes as a secret version after infrastructure
# creation, then enables the reviewed backend with a pinned version number.
resource "google_secret_manager_secret" "cursor" {
  secret_id = "${var.name}-cursor"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret_iam_member" "cursor" {
  secret_id = google_secret_manager_secret.cursor.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.identities["runtime"].email}"
}
# Optional relay credentials use the same operator-managed version pattern.
# Neither a password variable nor a Terraform secret-version resource exists.
resource "google_secret_manager_secret" "smtp_password" {
  count     = var.smtp_username == null ? 0 : 1
  secret_id = "${var.name}-smtp-password"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret_iam_member" "smtp_password" {
  count     = var.smtp_username == null ? 0 : 1
  secret_id = google_secret_manager_secret.smtp_password[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.identities["runtime"].email}"
}
