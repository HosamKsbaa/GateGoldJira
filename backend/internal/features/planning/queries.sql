-- name: PlanningInsert :one
INSERT INTO planning_items(id,project_id,kind,name,description,target_date,status,created_by)
VALUES(sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(kind),sqlc.arg(name),sqlc.arg(description),sqlc.narg(target_date),sqlc.arg(status),sqlc.arg(created_by)) RETURNING *;
-- name: PlanningUpdate :one
UPDATE planning_items SET name=sqlc.arg(name),description=sqlc.arg(description),target_date=sqlc.narg(target_date),status=sqlc.arg(status),revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id) AND project_id=sqlc.arg(project_id) RETURNING *;
-- name: PlanningGet :one
SELECT * FROM planning_items WHERE id=$1;
-- name: PlanningProgress :one
SELECT count(*)::integer AS issue_count,count(*) FILTER(WHERE i.stage_id IN (SELECT id FROM workflow_stages WHERE category='done'))::integer AS completed_count
FROM planning_issue a JOIN issues i ON i.id=a.issue_id WHERE NOT i.archived AND (a.epic_id=sqlc.arg(id) OR a.release_id=sqlc.arg(id));
-- name: PlanningList :many
SELECT p.*,count(i.id)::integer AS issue_count,count(i.id) FILTER(WHERE i.stage_id IN (SELECT id FROM workflow_stages WHERE category='done'))::integer AS completed_count
FROM planning_items p LEFT JOIN planning_issue a ON (a.epic_id=p.id OR a.release_id=p.id) LEFT JOIN issues i ON i.id=a.issue_id AND NOT i.archived
WHERE p.project_id=sqlc.arg(project_id) AND (sqlc.narg(kind)::text IS NULL OR p.kind=sqlc.narg(kind))
AND (NOT sqlc.arg(has_cursor)::boolean OR (p.kind,p.name COLLATE "C",p.id)>(sqlc.arg(after_kind)::text,sqlc.arg(after_name)::text COLLATE "C",sqlc.arg(after_id)::uuid))
GROUP BY p.id ORDER BY p.kind,p.name COLLATE "C",p.id LIMIT sqlc.arg(page_size);
-- name: PlanningCount :one
SELECT count(*)::integer FROM planning_items WHERE project_id=sqlc.arg(project_id) AND (sqlc.narg(kind)::text IS NULL OR kind=sqlc.narg(kind));
-- name: PlanningIssueGet :one
SELECT i.id AS issue_id,i.project_id,coalesce(a.revision,0)::bigint AS revision,a.epic_id,a.release_id,e.name AS epic_name,r.name AS release_name
FROM issues i LEFT JOIN planning_issue a ON a.issue_id=i.id LEFT JOIN planning_items e ON e.id=a.epic_id LEFT JOIN planning_items r ON r.id=a.release_id WHERE i.id=$1;
-- name: PlanningIssueSet :exec
INSERT INTO planning_issue(issue_id,project_id,epic_id,release_id) VALUES(sqlc.arg(issue_id),sqlc.arg(project_id),sqlc.narg(epic_id),sqlc.narg(release_id))
ON CONFLICT(issue_id) DO UPDATE SET epic_id=excluded.epic_id,release_id=excluded.release_id,revision=planning_issue.revision+1;
-- name: PlanningIssueMembers :many
SELECT i.id,i.number,i.title,i.status,stage.name AS stage_name FROM planning_issue a JOIN issues i ON i.id=a.issue_id JOIN workflow_stages stage ON stage.project_id=i.project_id AND stage.id=i.stage_id
WHERE NOT i.archived AND (a.epic_id=sqlc.arg(planning_id) OR a.release_id=sqlc.arg(planning_id))
AND i.project_id=sqlc.arg(project_id)
AND i.number>sqlc.arg(after_number) ORDER BY i.number LIMIT sqlc.arg(page_size);
-- name: PlanningReportSummary :one
SELECT count(*)::integer AS completed_cycles,count(*) FILTER(WHERE started_at IS NOT NULL)::integer AS measured_cycles,
coalesce(avg(extract(epoch FROM(completed_at-started_at))/86400),0)::double precision AS average_cycle_days
FROM planning_completion_cycles WHERE project_id=sqlc.arg(project_id) AND completed_at>=sqlc.arg(window_start)::timestamptz AND completed_at<sqlc.arg(window_end)::timestamptz;
-- name: PlanningReportDays :many
SELECT date_trunc('day',completed_at AT TIME ZONE 'UTC')::date AS day,count(*)::integer AS completed_cycles
FROM planning_completion_cycles WHERE project_id=sqlc.arg(project_id) AND completed_at>=sqlc.arg(window_start)::timestamptz AND completed_at<sqlc.arg(window_end)::timestamptz
GROUP BY 1 ORDER BY 1;
-- name: PlanningReportWork :many
SELECT i.id,i.number,i.title,i.status,stage.name AS stage_name,i.created_at,u.id AS assignee_id,u.display_name,
(SELECT min(s.created_at) FROM planning_status_events s WHERE s.issue_id=i.id AND (s.after_category IN ('in_progress','review') OR (s.before_category='done' AND s.after_category<>'done'))
 AND NOT EXISTS(SELECT 1 FROM planning_status_events d WHERE d.issue_id=i.id AND d.after_category='done' AND d.before_category IS DISTINCT FROM 'done' AND (d.created_at,d.id)>=(s.created_at,s.id)))::timestamptz AS started_at,
(SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blockers
FROM issues i JOIN workflow_stages stage ON stage.project_id=i.project_id AND stage.id=i.stage_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.project_id=sqlc.arg(project_id) AND NOT i.archived AND NOT i.backlog AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')
AND i.number>sqlc.arg(after_number) ORDER BY i.number LIMIT sqlc.arg(page_size);
-- name: PlanningReportCurrentCount :one
SELECT count(*)::integer AS active_count,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')))::integer AS blocked_count
FROM issues i WHERE i.project_id=$1 AND NOT i.archived AND NOT i.backlog AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done');
