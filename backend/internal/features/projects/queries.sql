-- name: ReadProject :one
SELECT * FROM projects WHERE id = $1;

-- name: ProjectsInsert :one
INSERT INTO projects(id,key,name,description,created_by)
VALUES(sqlc.arg(id),sqlc.arg(key),sqlc.arg(name),sqlc.arg(description),sqlc.arg(created_by)) RETURNING *;

-- name: ProjectsDefaultBoard :exec
INSERT INTO boards(id,project_id,name,name_key,created_by,is_default)
VALUES(sqlc.arg(id),sqlc.arg(project_id),'All Issues','all issues',sqlc.arg(created_by),true);

-- name: ProjectsInitialOrders :exec
INSERT INTO project_status_order(project_id,status,stage_name)
SELECT sqlc.arg(project_id)::uuid,status,CASE status WHEN 'todo' THEN 'To do' WHEN 'in_progress' THEN 'In progress' WHEN 'review' THEN 'Review' ELSE 'Done' END FROM unnest(ARRAY['todo','in_progress','review','done']) status;

-- name: ProjectsUpdate :one
UPDATE projects SET name=sqlc.arg(name),description=sqlc.arg(description),revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id) RETURNING *;

-- name: ProjectsSetArchive :one
UPDATE projects SET archived_at=CASE WHEN sqlc.arg(archived)::boolean THEN now() ELSE NULL END,
revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id) RETURNING *;

-- name: ProjectsList :many
SELECT p.*, (CASE WHEN sqlc.arg(is_admin)::boolean THEN 'administrator' ELSE m.role END)::text AS effective_role
FROM projects p LEFT JOIN project_memberships m ON m.project_id=p.id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL
WHERE (sqlc.arg(is_admin)::boolean OR m.user_id IS NOT NULL)
AND (sqlc.arg(include_archived)::boolean OR p.archived_at IS NULL)
AND (NOT sqlc.arg(has_cursor)::boolean OR (p.name COLLATE "C",p.id) > (sqlc.arg(after_name)::text COLLATE "C",sqlc.arg(after_id)::uuid))
ORDER BY p.name COLLATE "C",p.id LIMIT sqlc.arg(page_size);

-- name: ProjectsCount :one
SELECT count(*) FROM projects p
LEFT JOIN project_memberships m ON m.project_id=p.id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL
WHERE (sqlc.arg(is_admin)::boolean OR m.user_id IS NOT NULL)
AND (sqlc.arg(include_archived)::boolean OR p.archived_at IS NULL);
