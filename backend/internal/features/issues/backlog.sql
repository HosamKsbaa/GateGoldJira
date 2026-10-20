-- name: BacklogOrder :one
SELECT backlog_revision FROM projects WHERE id=$1;
-- name: BacklogAdvanceOrder :one
UPDATE projects SET backlog_revision=backlog_revision+1 WHERE id=$1 RETURNING backlog_revision;
-- name: BacklogMaximumRank :one
SELECT coalesce(max(backlog_rank),0)::bigint FROM issues WHERE project_id=$1;
-- name: BacklogCount :one
SELECT count(*)::integer FROM issues WHERE project_id=$1 AND backlog AND NOT archived;
-- name: BacklogRebalance :exec
WITH positions AS (SELECT i.id,row_number() OVER(ORDER BY i.backlog_rank,i.id)*1024 AS position FROM issues i WHERE i.project_id=$1 AND i.backlog AND NOT i.archived)
UPDATE issues SET backlog_rank=positions.position FROM positions WHERE issues.id=positions.id;
-- name: BacklogNeighbors :one
SELECT coalesce(max(backlog_rank) FILTER(WHERE backlog_rank<sqlc.arg(rank)),0)::bigint AS before_rank,coalesce(min(backlog_rank) FILTER(WHERE backlog_rank>sqlc.arg(rank)),0)::bigint AS after_rank
FROM issues WHERE project_id=sqlc.arg(project_id) AND backlog AND NOT archived AND id<>sqlc.arg(moving_id);
-- name: BacklogSetRank :exec
UPDATE issues SET backlog_rank=$2,revision=revision+1,updated_at=now() WHERE id=$1;
-- name: BacklogSetOnCreate :exec
UPDATE issues SET backlog=$2,backlog_rank=$3 WHERE id=$1;
-- name: BacklogSetInitialRank :exec
UPDATE issues SET backlog_rank=$2 WHERE id=$1;
-- name: ImportSourceGet :one
SELECT issue_id FROM issue_import_sources WHERE project_id=$1 AND source_key=$2;
-- name: ImportSourceSave :exec
INSERT INTO issue_import_sources(project_id,source_key,issue_id) VALUES($1,$2,$3);
-- name: BacklogList :many
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.project_id=sqlc.arg(project_id) AND i.backlog AND NOT i.archived
AND (NOT sqlc.arg(has_cursor)::boolean OR (i.backlog_rank,i.id)>(sqlc.arg(after_rank)::bigint,sqlc.arg(after_id)::uuid))
ORDER BY i.backlog_rank,i.id LIMIT sqlc.arg(page_size);
