-- name: IssuesOrganize :exec
UPDATE issues SET archived=coalesce(sqlc.narg(archived)::boolean,archived),backlog=coalesce(sqlc.narg(backlog)::boolean,backlog),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id);

-- name: IssuesSetWatch :exec
INSERT INTO issue_watchers(issue_id,user_id,watching) VALUES($1,$2,$3) ON CONFLICT(issue_id,user_id) DO UPDATE SET watching=EXCLUDED.watching,updated_at=now();

-- name: IssuesWatching :one
SELECT EXISTS(SELECT 1 FROM issue_watchers WHERE issue_id=$1 AND user_id=$2 AND watching);

-- name: IssuesSetLink :exec
INSERT INTO issue_links(issue_id,target_id,kind,created_by,removed_at) VALUES($1,$2,$3,$4,CASE WHEN sqlc.arg(enabled)::boolean THEN NULL ELSE now() END)
ON CONFLICT(issue_id,target_id,kind) DO UPDATE SET removed_at=EXCLUDED.removed_at;

-- name: IssuesLinks :many
SELECT l.issue_id,l.target_id,l.kind,(p.key||'-'||i.number)::text AS key,i.title,i.status
FROM issue_links l JOIN issues i ON i.id=CASE WHEN l.issue_id=$1 THEN l.target_id ELSE l.issue_id END JOIN projects p ON p.id=i.project_id
WHERE (l.issue_id=$1 OR l.target_id=$1) AND l.removed_at IS NULL ORDER BY l.created_at,l.target_id LIMIT 101;

-- name: IssuesLinkExists :one
SELECT EXISTS(SELECT 1 FROM issue_links WHERE issue_id=$1 AND target_id=$2 AND kind=$3 AND removed_at IS NULL);

-- name: IssuesAdvanceRevision :exec
UPDATE issues SET revision=revision+1,updated_at=now() WHERE id=$1;

-- name: SavedSearchesGet :one
SELECT * FROM saved_issue_searches WHERE id=$1 AND user_id=$2;

-- name: SavedSearchesList :many
SELECT * FROM saved_issue_searches WHERE user_id=$1 AND NOT removed ORDER BY name,id LIMIT 50;

-- name: SavedSearchesCount :one
SELECT count(*)::integer FROM saved_issue_searches WHERE user_id=$1 AND NOT removed;

-- name: SavedSearchesSave :one
INSERT INTO saved_issue_searches(id,user_id,name,filters,removed) VALUES($1,$2,$3,$4,$5)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,filters=EXCLUDED.filters,removed=EXCLUDED.removed,revision=saved_issue_searches.revision+1,updated_at=now() WHERE saved_issue_searches.user_id=EXCLUDED.user_id RETURNING *;

-- name: SavedSearchesLockUser :exec
SELECT id FROM users WHERE id=$1 FOR UPDATE;
