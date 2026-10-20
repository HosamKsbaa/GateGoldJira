-- name: ClaimRetryReference :exec
INSERT INTO idempotency_records (actor_id,retry_reference,operation,canonical_input_hash)
VALUES ($1,$2,$3,$4) ON CONFLICT (actor_id,retry_reference) DO NOTHING;

-- name: LockRetryRecord :one
SELECT * FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2 FOR UPDATE;

-- name: SaveRetryResult :exec
UPDATE idempotency_records SET result=$3 WHERE actor_id=$1 AND retry_reference=$2;

-- name: LockProjectShared :one
SELECT * FROM projects WHERE id=$1 FOR SHARE;

-- name: ProjectSharedLifecycle :one
SELECT pg_advisory_xact_lock_shared(hashtextextended('gategoldjira:project-lifecycle:'||sqlc.arg(project_id)::uuid::text,0));
-- name: ProjectExclusiveLifecycle :one
SELECT pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||sqlc.arg(project_id)::uuid::text,0));
