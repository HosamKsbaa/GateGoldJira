-- name: ReadCommentVersion :one
SELECT * FROM comment_versions WHERE comment_id=$1 AND revision=$2;

-- name: CommentsResolveIssue :one
SELECT id,project_id,reporter_id,assignee_id,title FROM issues WHERE id=$1;

-- name: CommentsResolve :one
SELECT * FROM comments WHERE id=$1;

-- name: CommentsView :one
SELECT c.*,u.display_name,v.safe_html,v.plain_text,
 coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'displayLabel',m.display_label_snapshot) ORDER BY m.user_id) FROM comment_version_mentions m WHERE m.comment_id=c.id AND m.version=c.revision),'[]'::jsonb)::jsonb AS mentions,
 ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='image' WHERE p.comment_id=c.id AND p.version=c.revision ORDER BY p.attachment_id)::uuid[] AS picture_ids, ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='file' WHERE p.comment_id=c.id AND p.version=c.revision ORDER BY p.attachment_id)::uuid[] AS attachment_ids FROM comments c JOIN users u ON u.id=c.author_id JOIN comment_versions v ON v.comment_id=c.id AND v.revision=c.revision WHERE c.id=$1;

-- name: CommentsList :many
SELECT c.*,u.display_name,v.safe_html,v.plain_text,
 coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'displayLabel',m.display_label_snapshot) ORDER BY m.user_id) FROM comment_version_mentions m WHERE m.comment_id=c.id AND m.version=c.revision),'[]'::jsonb)::jsonb AS mentions,
 ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='image' WHERE p.comment_id=c.id AND p.version=c.revision ORDER BY p.attachment_id)::uuid[] AS picture_ids, ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='file' WHERE p.comment_id=c.id AND p.version=c.revision ORDER BY p.attachment_id)::uuid[] AS attachment_ids FROM comments c JOIN users u ON u.id=c.author_id JOIN comment_versions v ON v.comment_id=c.id AND v.revision=c.revision WHERE c.issue_id=$1
 AND (NOT sqlc.arg(has_cursor)::boolean OR (c.created_at,c.id)>(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY c.created_at,c.id LIMIT sqlc.arg(page_size);

-- name: CommentsCount :one
SELECT count(*)::integer FROM comments WHERE issue_id=$1;

-- name: CommentsVersions :many
SELECT v.*,ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='image' WHERE p.comment_id=v.comment_id AND p.version=v.revision ORDER BY p.attachment_id)::uuid[] AS picture_ids, ARRAY(SELECT p.attachment_id FROM comment_version_attachments p JOIN attachments a ON a.id=p.attachment_id AND a.kind='file' WHERE p.comment_id=v.comment_id AND p.version=v.revision ORDER BY p.attachment_id)::uuid[] AS attachment_ids
FROM comment_versions v WHERE v.comment_id=$1 AND v.revision>sqlc.arg(after_revision)::bigint ORDER BY v.revision LIMIT sqlc.arg(page_size);

-- name: CommentsVersionCount :one
SELECT count(*)::integer FROM comment_versions WHERE comment_id=$1;

-- name: CommentsInsert :one
INSERT INTO comments(id,project_id,issue_id,author_id) VALUES($1,$2,$3,$4) RETURNING *;

-- name: CommentsAdvance :one
UPDATE comments SET revision=revision+1,edited_at=now() WHERE id=$1 RETURNING *;

-- name: CommentsInsertVersion :exec
INSERT INTO comment_versions(comment_id,revision,issue_id,safe_html,plain_text) VALUES($1,$2,$3,$4,$5);

-- name: CommentsInsertMention :batchexec
INSERT INTO comment_version_mentions(comment_id,version,user_id,display_label_snapshot) VALUES($1,$2,$3,$4);

-- name: CommentsInsertPicture :batchexec
INSERT INTO comment_version_attachments(comment_id,version,issue_id,attachment_id) VALUES($1,$2,$3,$4);

-- name: CommentsEligibleMentions :many
SELECT u.id,u.display_name FROM users u WHERE u.id=ANY(sqlc.arg(user_ids)::uuid[]) AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.user_id=u.id AND m.project_id=sqlc.arg(project_id)::uuid AND m.removed_at IS NULL));

-- name: CommentsRetry :one
SELECT operation,canonical_input_hash,(result IS NOT NULL)::boolean AS completed FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2;

-- name: CommentsInsertAsset :exec
INSERT INTO comment_version_attachments(comment_id,version,issue_id,attachment_id) VALUES($1,$2,$3,$4);
