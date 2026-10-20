-- name: ConfigurationLegacyBoards :many
SELECT id, workflow, archived_at FROM boards WHERE project_id=$1 ORDER BY is_default DESC,id;

-- name: ConfigurationAssetCollisions :many
SELECT code,reference FROM (
 SELECT 'asset_id_collision'::text AS code,p.id::text AS reference
 FROM pictures p JOIN attachments a ON a.id=p.id WHERE (p.project_id=$1 OR a.project_id=$1) AND coalesce(to_jsonb(a)->>'kind','file')='file'
 UNION ALL
 SELECT 'staging_key_collision'::text,p.id::text FROM pictures p JOIN attachments a ON a.staging_key=p.staging_key
 WHERE (p.project_id=$1 OR a.project_id=$1) AND coalesce(to_jsonb(a)->>'kind','file')='file'
 UNION ALL
 SELECT 'published_key_collision'::text,p.id::text FROM pictures p JOIN attachments a ON a.published_key=p.published_key
 WHERE (p.project_id=$1 OR a.project_id=$1) AND coalesce(to_jsonb(a)->>'kind','file')='file'
 UNION ALL
 SELECT 'upload_retry_collision'::text,p.retry_reference::text
 FROM upload_reservations p JOIN attachment_upload_reservations a ON a.actor_id=p.actor_id AND a.retry_reference=p.retry_reference
 WHERE (p.project_id=$1 OR a.project_id=$1) AND coalesce(to_jsonb(p)->>'operation','upload_picture')='upload_picture'
) collisions ORDER BY code,reference LIMIT 101;

-- name: ConfigurationView :one
SELECT p.id,p.configuration_revision,p.core_mode,
 (SELECT id FROM issue_types t WHERE t.project_id=p.id AND t.behavior='standard' AND t.is_default) AS standard_type_id,
 (SELECT id FROM issue_types t WHERE t.project_id=p.id AND t.behavior='subtask' AND t.is_default) AS subtask_type_id,
 (SELECT id FROM priorities v WHERE v.project_id=p.id AND v.is_default) AS priority_id
FROM projects p WHERE p.id=$1;

-- name: ConfigurationTypes :many
SELECT * FROM issue_types WHERE project_id=sqlc.arg(project_id)
 AND (sqlc.arg(include_retired)::boolean OR NOT retired)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (key COLLATE "C",id)>(sqlc.arg(after_key)::text COLLATE "C",sqlc.arg(after_id)::uuid))
ORDER BY key COLLATE "C",id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationTypeCount :one
SELECT count(*) FROM issue_types WHERE project_id=sqlc.arg(project_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired);
-- name: ConfigurationPriorityList :many
SELECT * FROM priorities WHERE project_id=sqlc.arg(project_id)
 AND (sqlc.arg(include_retired)::boolean OR NOT retired)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (sort_order,id)>(sqlc.arg(after_order)::bigint,sqlc.arg(after_id)::uuid))
ORDER BY sort_order,id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationPriorityCount :one
SELECT count(*) FROM priorities WHERE project_id=sqlc.arg(project_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired);
-- name: ConfigurationType :one
SELECT * FROM issue_types WHERE id=$1;
-- name: ConfigurationPriority :one
SELECT * FROM priorities WHERE id=$1;
-- name: ConfigurationTypeUse :one
SELECT EXISTS(SELECT 1 FROM issues WHERE type_id=sqlc.arg(type_id)::uuid);
-- name: ConfigurationTypeInsert :one
INSERT INTO issue_types(id,project_id,key,name,behavior) VALUES($1,$2,$3,$4,$5) RETURNING *;
-- name: ConfigurationTypeUpdate :one
UPDATE issue_types SET name=$2,behavior=$3,retired=$4 WHERE id=$1 RETURNING *;
-- name: ConfigurationPriorityInsert :one
INSERT INTO priorities(id,project_id,key,name,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *;
-- name: ConfigurationPriorityUpdate :one
UPDATE priorities SET name=$2,sort_order=$3,retired=$4 WHERE id=$1 RETURNING *;
-- name: ConfigurationClearTypeDefault :exec
UPDATE issue_types SET is_default=false WHERE project_id=$1 AND behavior=$2 AND is_default;
-- name: ConfigurationSetTypeDefault :exec
UPDATE issue_types SET is_default=true WHERE id=$1;
-- name: ConfigurationClearPriorityDefault :exec
UPDATE priorities SET is_default=false WHERE project_id=$1 AND is_default;
-- name: ConfigurationSetPriorityDefault :exec
UPDATE priorities SET is_default=true WHERE id=$1;
-- name: ConfigurationEligibleTypeFlow :one
SELECT b.workflow_id FROM issue_type_workflows b JOIN workflows w ON w.id=b.workflow_id
JOIN issue_types t ON t.id=b.type_id WHERE b.project_id=$1 AND b.type_id=$2 AND b.is_default AND b.accepts_new
AND NOT w.retired AND NOT t.retired
AND EXISTS(SELECT 1 FROM workflow_stages s WHERE s.workflow_id=w.id AND s.is_initial AND s.accepts_entries AND NOT s.retired);
-- name: ConfigurationBindType :exec
INSERT INTO issue_type_workflows(project_id,type_id,workflow_id,is_default,accepts_new) VALUES($1,$2,$3,true,true);
-- name: ConfigurationAdvance :exec
UPDATE projects SET configuration_revision=configuration_revision+1 WHERE id=$1;
