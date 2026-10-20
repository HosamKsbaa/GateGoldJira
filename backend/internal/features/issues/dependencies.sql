-- name: DependenciesRead :one
SELECT * FROM issue_dependencies WHERE dependent_id=$1 AND blocker_id=$2;

-- name: DependenciesInsert :one
INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4) RETURNING *;

-- name: DependenciesRestore :one
UPDATE issue_dependencies SET removed_at=NULL,removed_by=NULL,revision=revision+1 WHERE dependent_id=$1 AND blocker_id=$2 RETURNING *;

-- name: DependenciesRemove :one
UPDATE issue_dependencies SET removed_at=now(),removed_by=$3,revision=revision+1 WHERE dependent_id=$1 AND blocker_id=$2 RETURNING *;

-- name: DependenciesList :many
SELECT sqlc.embed(d), CASE WHEN sqlc.arg(blocked_by)::boolean THEN b.number ELSE dependent.number END::bigint AS other_number
FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id JOIN issues dependent ON dependent.id=d.dependent_id
WHERE d.project_id=sqlc.arg(project_id) AND d.removed_at IS NULL
 AND ((sqlc.arg(blocked_by)::boolean AND d.dependent_id=sqlc.arg(issue_id)) OR (NOT sqlc.arg(blocked_by)::boolean AND d.blocker_id=sqlc.arg(issue_id)))
 AND (NOT sqlc.arg(has_cursor)::boolean OR (CASE WHEN sqlc.arg(blocked_by)::boolean THEN b.number ELSE dependent.number END)>sqlc.arg(after_number)::bigint)
ORDER BY other_number LIMIT sqlc.arg(page_size)::integer;

-- name: DependenciesCount :one
SELECT count(*) FROM issue_dependencies d WHERE d.project_id=sqlc.arg(project_id) AND d.removed_at IS NULL
 AND ((sqlc.arg(blocked_by)::boolean AND d.dependent_id=sqlc.arg(issue_id)) OR (NOT sqlc.arg(blocked_by)::boolean AND d.blocker_id=sqlc.arg(issue_id)));

-- name: DependenciesSummaries :many
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.project_id=$1 AND i.id=ANY($2::uuid[]);

