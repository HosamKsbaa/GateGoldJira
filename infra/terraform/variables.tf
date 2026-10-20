variable "project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Choose the explicitly authorized isolated Google Cloud project ID."
  }
}
variable "region" {
  type    = string
  default = "europe-west1"
  validation {
    condition     = var.region == "europe-west1"
    error_message = "This candidate is priced and reviewed for europe-west1."
  }
}
variable "name" {
  type    = string
  default = "gategoldjira-test"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,22}$", var.name))
    error_message = "Use a short isolated resource prefix."
  }
}
variable "backend_enabled" {
  type        = bool
  default     = false
  description = "Enable only after schema/IAM database grants, cursor secret and reviewed image are ready."
}
variable "backend_image" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9.-]+/[a-z0-9/_-]+@sha256:[a-f0-9]{64}$", var.backend_image))
    error_message = "Use an immutable reviewed Artifact Registry image digest."
  }
}
variable "backend_origin" {
  type = string
  validation {
    condition     = can(regex("^https://[a-z0-9.-]+$", var.backend_origin))
    error_message = "Use the exact HTTPS service origin without a path."
  }
}
variable "frontend_origin" {
  type = string
  validation {
    condition     = can(regex("^https://[a-z0-9.-]+$", var.frontend_origin))
    error_message = "Use the exact Firebase Hosting origin without a path."
  }
}
variable "auth_issuer" {
  type = string
  validation {
    condition     = can(regex("^https://[a-z0-9.-]+/$", var.auth_issuer))
    error_message = "Use the public Auth0 issuer with a trailing slash."
  }
}
variable "cursor_secret_version" {
  type    = string
  default = "1"
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.cursor_secret_version))
    error_message = "Pin a reviewed Secret Manager version, never latest."
  }
}
variable "min_instances" {
  type    = number
  default = 0
  validation {
    condition     = contains([0, 1], var.min_instances)
    error_message = "The cost-reviewed alternatives are min0 or min1."
  }
}
variable "database_tier" {
  type    = string
  default = "db-g1-small"
  validation {
    condition     = contains(["db-g1-small", "db-custom-1-3840"], var.database_tier)
    error_message = "Benchmark and cost-review the shared or dedicated candidate."
  }
}
variable "billing_account" {
  type        = string
  default     = null
  nullable    = true
  description = "Existing billing account ID; gross-cost budget is prepared when supplied."
}
variable "monthly_budget_usd" {
  type    = number
  default = 50
  validation {
    condition     = var.monthly_budget_usd > 0 && floor(var.monthly_budget_usd) == var.monthly_budget_usd
    error_message = "Use a positive whole-dollar reviewed gross budget."
  }
}
variable "notification_channels" {
  type        = list(string)
  default     = []
  description = "Existing Monitoring channel resource names, chosen by the operator. No messages are sent by preparation."
}
variable "smtp_address" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional reviewed STARTTLS relay host:port. Null keeps notification email disabled."
  validation {
    condition     = var.smtp_address == null ? var.smtp_from == null && var.smtp_username == null : can(regex("^[a-zA-Z0-9.-]+:[0-9]{1,5}$", var.smtp_address)) && var.smtp_from != null
    error_message = "SMTP needs a relay host:port and sender; leave all SMTP settings null to disable email."
  }
}
variable "smtp_from" {
  type        = string
  default     = null
  nullable    = true
  description = "Verified sender email for the optional notification relay."
  validation {
    condition     = var.smtp_from == null ? true : can(regex("^[^\\s@<>]+@[^\\s@<>]+$", var.smtp_from))
    error_message = "Use the verified sender's email address without a display name."
  }
}
variable "smtp_username" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional relay account. Its password is added outside Terraform to the generated Secret Manager secret."
  validation {
    condition     = var.smtp_username == null ? true : length(var.smtp_username) > 0 && !can(regex("[\\r\\n]", var.smtp_username))
    error_message = "An authenticated SMTP account needs a relay and a username without line breaks."
  }
}
variable "smtp_password_secret_version" {
  type        = string
  default     = "1"
  description = "Pinned reviewed Secret Manager password version; no password value enters Terraform."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.smtp_password_secret_version))
    error_message = "Pin a numeric SMTP password version, never latest."
  }
}
variable "migration_job_enabled" {
  type        = bool
  default     = false
  description = "Prepare the separate migration job after its immutable image exists; execution is a distinct operator action."
}

variable "backend_revision_name" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional explicitly reviewed service-prefixed revision name for a canary artifact."
  validation {
    condition     = var.backend_revision_name == null ? true : startswith(var.backend_revision_name, "${var.name}-backend-") && can(regex("^[a-z][a-z0-9-]{1,61}[a-z0-9]$", var.backend_revision_name))
    error_message = "Use a Cloud Run revision name beginning with the exact backend service name, at most63 characters."
  }
}
variable "backend_traffic" {
  type        = map(number)
  default     = {}
  description = "Initial creation uses latest. Later releases must pin named revision percentages, first100% previous, then95/5 canary, then100% new."
  validation {
    condition     = length(var.backend_traffic) == 0 ? true : length(var.backend_traffic) <= 2 && sum(values(var.backend_traffic)) == 100 && alltrue([for revision, percent in var.backend_traffic : startswith(revision, "${var.name}-backend-") && can(regex("^[a-z][a-z0-9-]{1,61}[a-z0-9]$", revision)) && percent > 0 && percent <= 100 && floor(percent) == percent])
    error_message = "Pin one or two service-prefixed named revisions with positive whole percentages summing to100."
  }
}

variable "mcp_browser_oauth_enabled" {
  type        = bool
  default     = true
  description = "Enable GateGoldJira's MCP OAuth broker using the existing verified OIDC browser identities. Local password fixtures remain forbidden in production."
}
