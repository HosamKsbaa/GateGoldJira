-- name: ConfigurationWorkflow :one
SELECT * FROM workflows WHERE id=$1;
-- name: ConfigurationWorkflows :many
SELECT * FROM workflows WHERE project_id=sqlc.arg(project_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired)
AND (NOT sqlc.arg(has_cursor)::boolean OR id>sqlc.arg(after_id)::uuid) ORDER BY id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationWorkflowCount :one
SELECT count(*) FROM workflows WHERE project_id=sqlc.arg(project_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired);
-- name: ConfigurationWorkflowInsert :one
INSERT INTO workflows(id,project_id,name) VALUES($1,$2,$3) RETURNING *;
-- name: ConfigurationWorkflowUpdate :one
UPDATE workflows SET name=$2,retired=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *;
-- name: ConfigurationWorkflowAdvance :exec
UPDATE workflows SET revision=revision+1,updated_at=now() WHERE id=$1;
-- name: ConfigurationWorkflowDefaultUse :one
SELECT EXISTS(SELECT 1 FROM issue_type_workflows WHERE workflow_id=$1 AND is_default);
-- name: ConfigurationCloseWorkflowBindings :exec
UPDATE issue_type_workflows SET accepts_new=false WHERE workflow_id=$1 AND NOT is_default;
-- name: ConfigurationStage :one
SELECT * FROM workflow_stages WHERE id=$1;
-- name: ConfigurationStages :many
SELECT * FROM workflow_stages WHERE workflow_id=sqlc.arg(workflow_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired)
AND (NOT sqlc.arg(has_cursor)::boolean OR (position,id)>(sqlc.arg(after_position)::bigint,sqlc.arg(after_id)::uuid)) ORDER BY position,id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationStageCount :one
SELECT count(*) FROM workflow_stages WHERE workflow_id=sqlc.arg(workflow_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired);
-- name: ConfigurationFlowStages :many
SELECT * FROM workflow_stages WHERE workflow_id=$1 ORDER BY position,id;
-- name: ConfigurationFlowTransitions :many
SELECT * FROM workflow_transitions WHERE workflow_id=$1 AND NOT retired ORDER BY id;
-- name: ConfigurationClearInitial :exec
UPDATE workflow_stages SET is_initial=false WHERE workflow_id=$1 AND is_initial;
-- name: ConfigurationStageInsert :one
INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position,is_initial,accepts_entries,retired)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *;
-- name: ConfigurationStageUpdate :one
UPDATE workflow_stages SET name=$2,position=$3,is_initial=$4,accepts_entries=$5,retired=$6 WHERE id=$1 RETURNING *;
-- name: ConfigurationStageReferenced :one
SELECT (EXISTS(SELECT 1 FROM issues i WHERE i.stage_id=sqlc.arg(stage_id)::uuid) OR EXISTS(SELECT 1 FROM project_assignment_rules r WHERE r.stage_id=sqlc.arg(stage_id)::uuid))::boolean AS referenced;
-- name: ConfigurationTransition :one
SELECT * FROM workflow_transitions WHERE id=$1;
-- name: ConfigurationTransitionInsert :one
INSERT INTO workflow_transitions(id,project_id,workflow_id,from_stage_id,to_stage_id,required_permission,retired)
VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;
-- name: ConfigurationTransitionUpdate :one
UPDATE workflow_transitions SET required_permission=$2,retired=$3 WHERE id=$1 RETURNING *;
-- name: ConfigurationBinding :one
SELECT * FROM issue_type_workflows WHERE project_id=$1 AND type_id=$2 AND workflow_id=$3;
-- name: ConfigurationClearBindingDefault :exec
UPDATE issue_type_workflows SET is_default=false WHERE project_id=$1 AND type_id=$2 AND is_default;
-- name: ConfigurationSaveBinding :exec
INSERT INTO issue_type_workflows(project_id,type_id,workflow_id,is_default,accepts_new) VALUES($1,$2,$3,$4,$5)
ON CONFLICT(project_id,type_id,workflow_id) DO UPDATE SET is_default=EXCLUDED.is_default,accepts_new=EXCLUDED.accepts_new;
-- name: ConfigurationFlowNeedsProgression :one
SELECT (EXISTS(SELECT 1 FROM issues i WHERE i.workflow_id=sqlc.arg(workflow_id)::uuid)
OR EXISTS(SELECT 1 FROM issue_type_workflows b WHERE b.workflow_id=sqlc.arg(workflow_id)::uuid AND b.accepts_new))::boolean AS needed;
-- name: ConfigurationFlowNeedsCoverage :one
SELECT (EXISTS(SELECT 1 FROM issues i WHERE i.workflow_id=sqlc.arg(workflow_id)::uuid) OR EXISTS(SELECT 1 FROM issue_type_workflows b WHERE b.workflow_id=sqlc.arg(workflow_id)::uuid AND b.accepts_new))::boolean AS needed;
-- name: ConfigurationDefaultBoardWorkflow :one
SELECT workflow FROM boards WHERE project_id=$1 AND is_default AND archived_at IS NULL;
-- name: ConfigurationMigrationIssues :many
SELECT id FROM issues WHERE project_id=sqlc.arg(project_id) AND stage_id=sqlc.arg(stage_id) ORDER BY id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationMigrationRemaining :one
SELECT count(*) FROM issues WHERE project_id=$1 AND stage_id=$2;
-- name: ConfigurationMigrationTypeCompatibility :one
SELECT NOT EXISTS(SELECT 1 FROM issues i WHERE i.project_id=$1 AND i.stage_id=$2
AND NOT EXISTS(SELECT 1 FROM issue_type_workflows b WHERE b.project_id=i.project_id AND b.type_id=i.type_id AND b.workflow_id=$3));

-- name: ConfigurationOccupiedStageIDs :many
SELECT s.id FROM workflow_stages s WHERE s.workflow_id=$1 AND EXISTS(SELECT 1 FROM issues i WHERE i.project_id=s.project_id AND i.workflow_id=s.workflow_id AND i.stage_id=s.id);

-- name: ConfigurationTransitions :many
SELECT * FROM workflow_transitions WHERE workflow_id=sqlc.arg(workflow_id)
AND (sqlc.arg(include_retired)::boolean OR NOT retired)
AND (NOT sqlc.arg(has_cursor)::boolean OR id>sqlc.arg(after_id)::uuid)
ORDER BY id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationTransitionCount :one
SELECT count(*) FROM workflow_transitions WHERE workflow_id=$1 AND ($2::boolean OR NOT retired);
-- name: ConfigurationBindings :many
SELECT * FROM issue_type_workflows WHERE project_id=sqlc.arg(project_id) AND type_id=sqlc.arg(type_id)
AND (NOT sqlc.arg(has_cursor)::boolean OR workflow_id>sqlc.arg(after_id)::uuid)
ORDER BY workflow_id LIMIT sqlc.arg(page_size)::integer;
-- name: ConfigurationBindingCount :one
SELECT count(*) FROM issue_type_workflows WHERE project_id=$1 AND type_id=$2;

-- name: ConfigurationDefaultBoardStageIDs :many
SELECT mapping.stage_id FROM board_column_stages mapping JOIN boards b ON b.id=mapping.board_id WHERE b.project_id=$1 AND b.is_default AND b.archived_at IS NULL;
