-- name: IssuesCanonicalMetadata :many
SELECT i.id AS issue_id,project_config.core_mode AS project_mode,t.id AS type_id,t.key AS type_key,t.name AS type_name,t.behavior,t.retired AS type_retired,
 p.id AS priority_id,p.key AS priority_key,p.name AS priority_name,p.sort_order AS priority_order,p.retired AS priority_retired,
 w.id AS workflow_id,w.name AS workflow_name,w.revision AS workflow_revision,w.retired AS workflow_retired,
 s.id AS stage_id,s.name AS stage_name,s.legacy_status,s.category,s.position AS stage_position,s.is_initial,s.accepts_entries,s.retired AS stage_retired
FROM issue_records i JOIN projects project_config ON project_config.id=i.project_id JOIN issue_types t ON t.project_id=i.project_id AND t.id=i.type_id
JOIN priorities p ON p.project_id=i.project_id AND p.id=i.priority_id
JOIN workflows w ON w.project_id=i.project_id AND w.id=i.workflow_id
JOIN workflow_stages s ON s.project_id=i.project_id AND s.workflow_id=i.workflow_id AND s.id=i.stage_id
WHERE i.id=ANY(sqlc.arg(issue_ids)::uuid[]) ORDER BY i.id;

-- name: IssuesCanonicalType :one
SELECT * FROM issue_types WHERE project_id=$1 AND id=$2;
-- name: IssuesCanonicalPriority :one
SELECT * FROM priorities WHERE project_id=$1 AND id=$2;
-- name: IssuesCanonicalWorkflow :one
SELECT * FROM workflows WHERE project_id=$1 AND id=$2;
-- name: IssuesCanonicalStage :one
SELECT * FROM workflow_stages WHERE project_id=$1 AND workflow_id=$2 AND id=$3;
-- name: IssuesCanonicalDefaultType :one
SELECT * FROM issue_types WHERE project_id=$1 AND behavior=$2 AND is_default AND NOT retired;
-- name: IssuesCanonicalDefaultPriority :one
SELECT * FROM priorities WHERE project_id=$1 AND is_default AND NOT retired;
-- name: IssuesCanonicalDefaultWorkflow :one
SELECT w.* FROM issue_type_workflows b JOIN workflows w ON w.id=b.workflow_id AND w.project_id=b.project_id
WHERE b.project_id=$1 AND b.type_id=$2 AND b.is_default AND b.accepts_new AND NOT w.retired;
-- name: IssuesCanonicalBinding :one
SELECT * FROM issue_type_workflows WHERE project_id=$1 AND type_id=$2 AND workflow_id=$3;
-- name: IssuesCanonicalInitial :one
SELECT * FROM workflow_stages WHERE project_id=$1 AND workflow_id=$2 AND is_initial AND accepts_entries AND NOT retired;
-- name: IssuesCanonicalTransition :one
SELECT * FROM workflow_transitions WHERE project_id=$1 AND workflow_id=$2 AND from_stage_id=$3 AND to_stage_id=$4 AND NOT retired;
-- name: IssuesCanonicalInsert :one
INSERT INTO issues(id,project_id,number,title,description,description_format,type,priority,status,reporter_id,assignee_id,due_date,parent_id,rank,type_id,priority_id,workflow_id,stage_id)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *;
-- name: IssuesCanonicalUpdate :one
UPDATE issues SET title=$2,description=$3,description_format=$4,type_id=$5,priority_id=$6,assignee_id=$7,due_date=$8,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *;

-- name: IssuesPatchCanonicalPriority :exec
UPDATE issues SET priority_id=$2,revision=revision+1,updated_at=now() WHERE id=$1;

-- name: IssuesLegacySearchRequiresUpgrade :one
SELECT EXISTS(SELECT 1 FROM projects p WHERE p.core_mode='modern'
AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR p.id=ANY(sqlc.arg(project_ids)::uuid[]))
AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=p.id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL)));

-- name: IssuesCanonicalAvailableTransitions :many
SELECT e.id,e.required_permission,e.approvals_required,sqlc.embed(s)
FROM workflow_transitions e JOIN workflow_stages s ON s.project_id=e.project_id AND s.workflow_id=e.workflow_id AND s.id=e.to_stage_id
WHERE e.project_id=sqlc.arg(project_id) AND e.workflow_id=sqlc.arg(workflow_id) AND e.from_stage_id=sqlc.arg(stage_id)
AND NOT e.retired AND NOT s.retired AND s.accepts_entries
AND (NOT sqlc.arg(has_cursor)::boolean OR e.id>sqlc.arg(after_id)::uuid)
ORDER BY e.id LIMIT sqlc.arg(page_size)::integer;
-- name: IssuesCanonicalAvailableTransitionCount :one
SELECT count(*) FROM workflow_transitions e JOIN workflow_stages s ON s.project_id=e.project_id AND s.workflow_id=e.workflow_id AND s.id=e.to_stage_id
WHERE e.project_id=$1 AND e.workflow_id=$2 AND e.from_stage_id=$3 AND NOT e.retired AND NOT s.retired AND s.accepts_entries;
