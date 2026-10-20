-- name: IntegrationLinkGet :one
SELECT * FROM development_links WHERE id=$1;
-- name: IntegrationLinkInsert :one
INSERT INTO development_links(id,issue_id,url,title,kind,created_by)VALUES(sqlc.arg(id),sqlc.arg(issue_id),sqlc.arg(url),sqlc.arg(title),sqlc.arg(kind),sqlc.arg(created_by)) RETURNING *;
-- name: IntegrationLinkUpdate :one
UPDATE development_links SET url=sqlc.arg(url),title=sqlc.arg(title),kind=sqlc.arg(kind),removed=sqlc.arg(removed),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id) RETURNING *;
-- name: IntegrationLinkList :many
SELECT * FROM development_links WHERE issue_id=sqlc.arg(issue_id) AND NOT removed
AND (NOT sqlc.arg(has_cursor)::boolean OR (created_at,id)>(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid)) ORDER BY created_at,id LIMIT sqlc.arg(page_size);
-- name: IntegrationLinkCount :one
SELECT count(*)::integer FROM development_links WHERE issue_id=$1 AND NOT removed;
-- name: IntegrationRuleGet :one
SELECT r.*,u.display_name FROM project_assignment_rules r JOIN users u ON u.id=r.assignee_id WHERE r.id=$1;
-- name: IntegrationRuleList :many
SELECT r.*,u.display_name FROM project_assignment_rules r JOIN users u ON u.id=r.assignee_id
WHERE r.project_id=sqlc.arg(project_id) AND (NOT sqlc.arg(has_cursor)::boolean OR (r.name COLLATE "C",r.id)>(sqlc.arg(after_name)::text COLLATE "C",sqlc.arg(after_id)::uuid))
ORDER BY r.name COLLATE "C",r.id LIMIT sqlc.arg(page_size);
-- name: IntegrationRuleCount :one
SELECT count(*)::integer FROM project_assignment_rules WHERE project_id=$1;
-- name: IntegrationRuleInsert :exec
INSERT INTO project_assignment_rules(id,project_id,name,stage,assignee_id,enabled,created_by)VALUES(sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(name),sqlc.arg(stage),sqlc.arg(assignee_id),sqlc.arg(enabled),sqlc.arg(created_by));
-- name: IntegrationRuleUpdate :exec
UPDATE project_assignment_rules SET name=sqlc.arg(name),stage=sqlc.arg(stage),assignee_id=sqlc.arg(assignee_id),enabled=sqlc.arg(enabled),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id);
-- name: IntegrationStageExists :one
SELECT EXISTS(SELECT 1 FROM workflow_stages WHERE project_id=sqlc.arg(project_id) AND legacy_status=sqlc.arg(stage) AND NOT retired AND accepts_entries)::boolean;
-- name: IntegrationStageRule :one
SELECT r.id,r.name,r.assignee_id FROM project_assignment_rules r JOIN users u ON u.id=r.assignee_id
LEFT JOIN project_memberships m ON m.project_id=r.project_id AND m.user_id=r.assignee_id
WHERE r.project_id=sqlc.arg(project_id) AND r.stage=sqlc.arg(stage) AND r.enabled
AND EXISTS(SELECT 1 FROM workflow_stages s WHERE s.project_id=r.project_id AND s.legacy_status=r.stage AND NOT s.retired AND s.accepts_entries)
AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL AND (u.is_administrator OR (m.removed_at IS NULL AND m.role IN('project_admin','member')));
-- name: IntegrationAssignIssue :exec
UPDATE issues SET assignee_id=sqlc.arg(assignee_id),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(issue_id);

-- name: IntegrationStageForID :one
SELECT legacy_status FROM workflow_stages WHERE project_id=$1 AND id=$2;
