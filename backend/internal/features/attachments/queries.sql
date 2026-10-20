-- name: AttachmentsResolveIssue :one
SELECT id,project_id,revision FROM issues WHERE id=$1;
-- name: AttachmentsResolveAttachment :one
SELECT project_id,issue_id FROM compatible_attachments WHERE id=$1;
-- name: AttachmentsView :one
SELECT a.*,u.display_name FROM compatible_attachments a JOIN users u ON u.id=a.uploaded_by WHERE a.id=$1;
-- name: AttachmentsList :many
SELECT a.*,u.display_name FROM compatible_attachments a JOIN users u ON u.id=a.uploaded_by
WHERE a.issue_id=$1 AND a.attached AND (NOT sqlc.arg(has_cursor)::boolean OR (a.uploaded_at,a.id)>(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY a.uploaded_at,a.id LIMIT sqlc.arg(page_size);
-- name: AttachmentsCount :one
SELECT count(*)::integer FROM compatible_attachments WHERE issue_id=$1 AND attached;
-- name: AttachmentsDetach :one
UPDATE compatible_attachments SET attached=false WHERE id=$1 RETURNING *;
-- name: AttachmentsAdvanceIssue :exec
UPDATE issues SET revision=revision+1,updated_at=now() WHERE id=$1;
-- name: AttachmentsLockIssue :one
SELECT revision FROM issues WHERE id=$1 FOR UPDATE;
-- name: AssetsLegacyIssueFits :one
SELECT NOT EXISTS(SELECT 1 FROM attachments WHERE issue_id=$1 AND kind='file' AND state='published' AND in_panel AND byte_size>10485760);
