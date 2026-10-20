-- name: PicturesResolveIssue :one
SELECT id,project_id,revision,reporter_id,assignee_id,title FROM issues WHERE id=$1;

-- name: PicturesResolvePicture :one
SELECT project_id,issue_id FROM compatible_pictures WHERE id=$1;

-- name: PicturesView :one
SELECT p.*,u.display_name FROM compatible_pictures p JOIN users u ON u.id=p.uploaded_by WHERE p.id=$1;

-- name: PicturesList :many
SELECT p.*,u.display_name FROM compatible_pictures p JOIN users u ON u.id=p.uploaded_by
WHERE p.issue_id=$1 AND (p.in_gallery OR (sqlc.arg(include_drafts)::boolean AND p.state='draft' AND p.uploaded_by=sqlc.arg(caller_id) AND p.expires_at>now()))
 AND (NOT sqlc.arg(has_cursor)::boolean OR (p.uploaded_at,p.id)>(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY p.uploaded_at,p.id LIMIT sqlc.arg(page_size);

-- name: PicturesCount :one
SELECT count(*)::integer FROM compatible_pictures p WHERE p.issue_id=$1 AND (p.in_gallery OR (sqlc.arg(include_drafts)::boolean AND p.state='draft' AND p.uploaded_by=sqlc.arg(caller_id) AND p.expires_at>now()));

-- name: PicturesDetach :one
UPDATE pictures SET in_gallery=false WHERE id=$1 RETURNING *;

-- name: PicturesAdvanceIssue :exec
UPDATE issues SET revision=revision+1,updated_at=now() WHERE id=$1;

-- name: PicturesVisible :one
SELECT p.*,u.display_name FROM compatible_pictures p JOIN users u ON u.id=p.uploaded_by
WHERE p.id=$1 AND (p.state='published' OR (p.state='draft' AND p.uploaded_by=sqlc.arg(caller_id) AND p.expires_at>now()));

-- name: PicturesCleanupPaused :one
SELECT cleanup_paused FROM company_settings WHERE singleton=true FOR SHARE;

-- name: PicturesCleanupRetryRecords :execrows
DELETE FROM idempotency_records WHERE (actor_id,retry_reference) IN (
 SELECT actor_id,retry_reference FROM idempotency_records WHERE expires_at<=now() ORDER BY expires_at,actor_id,retry_reference LIMIT 100 FOR UPDATE SKIP LOCKED
);
