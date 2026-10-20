-- name: IssuesInsertSubtask :one
INSERT INTO issues(id,project_id,number,title,description,description_format,type,priority,reporter_id,assignee_id,due_date,parent_id,rank,status)
VALUES(sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(number),sqlc.arg(title),sqlc.arg(description),sqlc.arg(description_format),'subtask',sqlc.arg(priority),sqlc.arg(reporter_id),sqlc.narg(assignee_id),sqlc.narg(due_date),sqlc.arg(parent_id),sqlc.arg(rank),sqlc.arg(status)) RETURNING *;

-- name: IssuesListSubtaskIDs :many
SELECT id,number FROM issues WHERE parent_id=sqlc.arg(parent_id) AND number>sqlc.arg(after_number)::bigint ORDER BY number LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesCountSubtasks :one
SELECT count(*)::integer FROM issues WHERE parent_id=$1;
