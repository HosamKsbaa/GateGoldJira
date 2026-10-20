-- name: ReadCompanySettings :one
SELECT time_zone, cleanup_paused FROM company_settings WHERE singleton = true;

-- name: ReadCurrentUser :one
SELECT * FROM users WHERE id=$1 FOR SHARE;

-- name: ReadCurrentMembership :one
SELECT * FROM project_memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE;

-- name: CompanySharedGuard :one
SELECT singleton FROM company_settings WHERE singleton = true FOR SHARE;

-- name: CompanyExclusiveGuard :one
SELECT singleton FROM company_settings WHERE singleton = true FOR UPDATE;

-- name: LockProject :one
SELECT * FROM projects WHERE id = $1 FOR UPDATE;
