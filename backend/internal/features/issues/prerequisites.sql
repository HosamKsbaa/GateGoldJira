-- name: PrerequisiteCycleWouldForm :one
WITH RECURSIVE edges(from_id,to_id) AS (
  SELECT d.dependent_id,d.blocker_id FROM issue_dependencies d WHERE d.project_id=$1 AND d.removed_at IS NULL
  UNION
  SELECT child.parent_id,child.id FROM issues child WHERE child.project_id=$1 AND child.parent_id IS NOT NULL
), reachable(id) AS (
  SELECT sqlc.arg(blocker_id)::uuid
  UNION
  SELECT e.to_id FROM edges e JOIN reachable r ON e.from_id=r.id
)
SELECT EXISTS(SELECT 1 FROM reachable WHERE id=sqlc.arg(dependent_id)::uuid)::boolean;

-- name: UnfinishedPrerequisites :many
SELECT i.id,i.number,i.title,i.status,i.assignee_id,
       bool_or(ref.is_blocker)::boolean AS is_blocker,
       bool_or(ref.is_child)::boolean AS is_child
FROM (
  SELECT d.blocker_id AS id,true AS is_blocker,false AS is_child
  FROM issue_dependencies d WHERE d.project_id=$1 AND d.dependent_id=$2 AND d.removed_at IS NULL
  UNION ALL
  SELECT child.id,false AS is_blocker,true AS is_child FROM issues child WHERE child.project_id=$1 AND child.parent_id=$2
) ref JOIN issues i ON i.id=ref.id AND i.project_id=$1
WHERE i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')
GROUP BY i.id,i.number,i.title,i.status,i.assignee_id
ORDER BY i.number,i.id
LIMIT 101;
