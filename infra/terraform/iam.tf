resource "google_service_account" "identities" {
  for_each     = toset(["runtime", "migration", "maintenance"])
  account_id   = "${var.name}-${each.key}"
  display_name = "GateGoldJira ${each.key} (isolated test)"
  depends_on   = [google_project_service.apis]
}
locals {
  database_roles = { for pair in setproduct(["runtime", "migration"], ["roles/cloudsql.client", "roles/cloudsql.instanceUser"]) : "${pair[0]}-${pair[1]}" => { identity = pair[0], role = pair[1] } }
}
resource "google_project_iam_member" "database" {
  for_each = local.database_roles
  project  = var.project_id
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.identities[each.value.identity].email}"
}
resource "google_sql_user" "identities" {
  for_each = toset(["runtime", "migration"])
  instance = google_sql_database_instance.database.name
  name     = trimsuffix(google_service_account.identities[each.key].email, ".gserviceaccount.com")
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
resource "google_project_iam_custom_role" "staging" {
  role_id     = "${replace(var.name, "-", "_")}_staging"
  title       = "GateGoldJira bounded staging I/O"
  permissions = ["storage.objects.create", "storage.objects.get", "storage.objects.delete", "storage.objects.update"]
}
resource "google_project_iam_custom_role" "published" {
  role_id     = "${replace(var.name, "-", "_")}_published"
  title       = "GateGoldJira immutable published I/O"
  permissions = ["storage.objects.create", "storage.objects.get"]
}
resource "google_storage_bucket_iam_member" "staging" {
  bucket = google_storage_bucket.pictures["staging"].name
  role   = google_project_iam_custom_role.staging.name
  member = "serviceAccount:${google_service_account.identities["runtime"].email}"
}
resource "google_storage_bucket_iam_member" "published" {
  bucket = google_storage_bucket.pictures["published"].name
  role   = google_project_iam_custom_role.published.name
  member = "serviceAccount:${google_service_account.identities["runtime"].email}"
}
