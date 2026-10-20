-- name: IssuesFindLabel :one
SELECT * FROM labels WHERE project_id=$1 AND name_key=$2;

-- name: IssuesInsertLabel :one
INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *;

-- name: IssuesListLabels :many
SELECT * FROM labels
WHERE project_id=sqlc.arg(project_id)
 AND (sqlc.arg(query)::text='' OR strpos(name_key,sqlc.arg(query)::text)>0)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (name_key,id)>(sqlc.arg(after_name)::text,sqlc.arg(after_id)::uuid))
ORDER BY name_key,id LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesCountLabels :one
SELECT count(*)::integer FROM labels WHERE project_id=$1 AND ($2::text='' OR strpos(name_key,$2::text)>0);
