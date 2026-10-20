-- name: ImportAssignees :many
SELECT u.id,u.display_name,u.email FROM users u WHERE u.approved_at IS NOT NULL AND u.disabled_at IS NULL
AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=$1 AND m.user_id=u.id AND m.role IN('project_admin','member') AND m.removed_at IS NULL)) ORDER BY u.id LIMIT 1001;
-- name: ImportStages :many
SELECT status,stage_name FROM project_status_order WHERE project_id=$1 ORDER BY status;
-- name: ImportExistingSources :many
SELECT source_key,issue_id FROM issue_import_sources WHERE project_id=$1 AND source_key=ANY($2::text[]);
-- name: ExportSourceKeys :many
SELECT issue_id,source_key FROM issue_import_sources WHERE project_id=$1 AND issue_id=ANY($2::uuid[]);
-- name: ExportIssueBodies :many
SELECT id,description,description_format FROM issues WHERE project_id=$1 AND id=ANY($2::uuid[]);

-- name: ImportTypeChoices :many
SELECT * FROM issue_types WHERE project_id=$1 ORDER BY id LIMIT 1001;
-- name: ImportPriorityChoices :many
SELECT * FROM priorities WHERE project_id=$1 ORDER BY id LIMIT 1001;
-- name: ImportStageChoices :many
SELECT * FROM workflow_stages WHERE project_id=$1 ORDER BY id LIMIT 1001;
