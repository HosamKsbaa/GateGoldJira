-- name: AssetsResolve :one
SELECT project_id,issue_id FROM attachments WHERE id=$1;
-- name: AssetsGet :one
SELECT a.*,u.display_name,i.revision AS issue_revision FROM attachments a JOIN users u ON u.id=a.uploaded_by JOIN issues i ON i.id=a.issue_id
WHERE a.id=$1 AND (a.state='published' OR (a.state='draft' AND a.uploaded_by=sqlc.arg(caller_id)::uuid AND a.expires_at>now()));
-- name: AssetsList :many
SELECT a.*,u.display_name,i.revision AS issue_revision FROM attachments a JOIN users u ON u.id=a.uploaded_by JOIN issues i ON i.id=a.issue_id
WHERE a.issue_id=sqlc.arg(issue_id)::uuid AND ((a.state='published' AND a.in_panel) OR (sqlc.arg(include_own_drafts)::boolean AND a.state='draft' AND a.uploaded_by=sqlc.arg(caller_id)::uuid AND a.expires_at>now()))
AND (NOT sqlc.arg(has_cursor)::boolean OR (a.uploaded_at,a.id)>(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY a.uploaded_at,a.id LIMIT sqlc.arg(page_size)::integer;
-- name: AssetsCount :one
SELECT count(*)::integer FROM attachments a WHERE a.issue_id=$1 AND ((a.state='published' AND a.in_panel) OR (sqlc.arg(include_own_drafts)::boolean AND a.state='draft' AND a.uploaded_by=sqlc.arg(caller_id)::uuid AND a.expires_at>now()));
-- name: AssetsLockIssue :one
SELECT id,project_id,revision,reporter_id,assignee_id,title FROM issues WHERE id=$1 FOR UPDATE;
-- name: AssetsLock :one
SELECT * FROM attachments WHERE id=$1 FOR UPDATE;
-- name: AssetsInsert :one
INSERT INTO attachments(id,project_id,issue_id,uploaded_by,kind,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,uploaded_at,expires_at,published_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,sqlc.narg(published_key),sqlc.narg(published_generation),$13,$14,now(),now()+interval '24 hours',sqlc.narg(published_at)) RETURNING *;
-- name: AssetsDetach :exec
UPDATE attachments SET in_panel=false WHERE id=$1;
-- name: AssetsPublish :execrows
UPDATE attachments SET state='published',in_panel=true,published_key=$2,published_generation=$3,published_at=now()
WHERE id=$1 AND state='draft' AND expires_at>now();
-- name: AssetsExpireDraft :execrows
UPDATE attachments SET state='expired' WHERE id=$1 AND state='draft';
-- name: AssetsAdvanceIssue :exec
UPDATE issues SET revision=revision+1,updated_at=now() WHERE id=$1;
-- name: AssetsReadRetry :one
SELECT operation,canonical_input_hash FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2;
-- name: AssetsReadSession :one
SELECT * FROM upload_reservations WHERE actor_id=$1 AND retry_reference=$2;
-- name: AssetsLockSession :one
SELECT * FROM upload_reservations WHERE actor_id=$1 AND retry_reference=$2 FOR UPDATE;
-- name: AssetsReserveSession :execrows
INSERT INTO upload_reservations(actor_id,retry_reference,operation,command_hash,asset_id,project_id,issue_id,kind,staging_key,lease_until,state,expected_bytes,maximum_bytes,upload_method,upload_expires_at,filename,description,mime_type,publication,checksum)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '45 seconds','uploading',$10,$11,$12,now()+interval '24 hours',$13,$14,$15,$16,$17)
ON CONFLICT(actor_id,retry_reference) DO NOTHING;
-- name: AssetsClaimSession :one
UPDATE upload_reservations SET state='uploading',lease_until=now()+interval '45 seconds',updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND upload_expires_at>now() AND (state='failed' OR (state='uploading' AND lease_until<=now())) RETURNING *;
-- name: AssetsFillLegacySession :exec
UPDATE upload_reservations SET expected_bytes=$3,filename=$4,description=$5,mime_type=$6,publication=$7
WHERE actor_id=$1 AND retry_reference=$2 AND expected_bytes IS NULL;
-- name: AssetsReadySession :one
UPDATE upload_reservations SET state='ready',staging_generation=$3,checksum=$4,published_key=sqlc.narg(published_key),published_generation=sqlc.narg(published_generation),received_bytes=expected_bytes,updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state='uploading' AND lease_until=sqlc.arg(expected_lease)::timestamptz RETURNING *;
-- name: AssetsCommitSession :execrows
UPDATE upload_reservations SET state='committed',storage_session=NULL,updated_at=now() WHERE actor_id=$1 AND retry_reference=$2 AND state='ready' AND upload_expires_at>now();
-- name: AssetsFailSession :exec
UPDATE upload_reservations SET state='failed',lease_until=now(),staging_generation=coalesce(sqlc.narg(staging_generation),staging_generation),updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state='uploading' AND lease_until=sqlc.arg(expected_lease)::timestamptz;

-- name: AssetsExpireUnreferencedDrafts :execrows
UPDATE attachments a SET state='expired' WHERE a.id IN(
 SELECT draft.id FROM attachments draft WHERE draft.state='draft' AND draft.expires_at<=now()
 AND NOT EXISTS(SELECT 1 FROM comment_version_attachments reference WHERE reference.attachment_id=draft.id)
 AND NOT EXISTS(SELECT 1 FROM issues i WHERE i.id=draft.issue_id AND strpos(i.description,draft.id::text)>0)
 ORDER BY draft.expires_at,draft.id LIMIT 100 FOR UPDATE SKIP LOCKED);
-- name: AssetsClaimCleanup :many
UPDATE upload_reservations r SET lease_until=now()+interval '45 seconds',state=CASE WHEN r.state='failed' THEN 'failed' ELSE 'expired' END,updated_at=now()
WHERE (r.actor_id,r.retry_reference) IN(
 SELECT candidate.actor_id,candidate.retry_reference FROM upload_reservations candidate LEFT JOIN attachments a ON a.id=candidate.asset_id
 WHERE (candidate.staging_generation IS NOT NULL OR candidate.storage_session IS NOT NULL) AND candidate.lease_until<=now()
 AND ((candidate.state IN('failed','canceled','expired') AND candidate.updated_at<now()-interval '24 hours')
 OR(candidate.state IN('uploading','ready') AND candidate.upload_expires_at<=now()) OR(candidate.state='committed' AND a.state='expired'))
 AND NOT EXISTS(SELECT 1 FROM comment_version_attachments reference WHERE reference.attachment_id=candidate.asset_id)
 AND NOT EXISTS(SELECT 1 FROM issues i WHERE i.id=candidate.issue_id AND strpos(i.description,candidate.asset_id::text)>0)
 ORDER BY candidate.updated_at,candidate.asset_id LIMIT 100 FOR UPDATE OF candidate SKIP LOCKED)
RETURNING r.*;
-- name: AssetsFinishCleanup :execrows
UPDATE upload_reservations SET staging_generation=NULL,storage_session=NULL,lease_until=now(),updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state IN('expired','failed') AND lease_until=sqlc.arg(expected_lease)::timestamptz AND staging_generation=$3;

-- name: AssetsSetStorageSession :one
UPDATE upload_reservations SET storage_session=$3,lease_until=now(),updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state='uploading' AND storage_session IS NULL AND lease_until=sqlc.arg(expected_lease)::timestamptz RETURNING *;
-- name: AssetsLeaseChunk :one
UPDATE upload_reservations SET lease_until=now()+interval '45 seconds',last_chunk_hash=sqlc.arg(chunk_hash)::text,updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state='uploading' AND upload_expires_at>now() AND storage_session IS NOT NULL
AND lease_until<=now() AND received_bytes=sqlc.arg(expected_offset)::bigint AND (last_chunk_hash IS NULL OR last_chunk_hash=sqlc.arg(chunk_hash)::text) RETURNING *;
-- name: AssetsAcceptChunk :one
UPDATE upload_reservations SET received_bytes=$3,last_chunk_hash=NULL,lease_until=now(),updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state='uploading' AND upload_expires_at>now() AND lease_until=sqlc.arg(expected_lease)::timestamptz RETURNING *;
-- name: AssetsLeaseFinalize :one
UPDATE upload_reservations SET lease_until=now()+interval '45 seconds',updated_at=now()
WHERE actor_id=$1 AND retry_reference=$2 AND state IN('uploading','ready') AND upload_expires_at>now() AND lease_until<=now()
AND received_bytes=expected_bytes AND storage_session IS NOT NULL RETURNING *;
-- name: AssetsReleaseLease :exec
UPDATE upload_reservations SET lease_until=now() WHERE actor_id=$1 AND retry_reference=$2 AND lease_until=sqlc.arg(expected_lease)::timestamptz;
-- name: AssetsCancelSession :one
UPDATE upload_reservations SET state='canceled',lease_until=now(),updated_at=now() WHERE actor_id=$1 AND retry_reference=$2 AND state IN('uploading','ready','failed','canceled') AND lease_until<=now() RETURNING *;

-- name: AssetsFinishPartialCleanup :execrows
UPDATE upload_reservations SET storage_session=NULL,lease_until=now(),updated_at=now() WHERE actor_id=$1 AND retry_reference=$2 AND state='expired' AND staging_generation IS NULL AND lease_until=sqlc.arg(expected_lease)::timestamptz;
