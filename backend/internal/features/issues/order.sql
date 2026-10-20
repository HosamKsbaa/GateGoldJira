-- name: MaximumColumnRank :one
SELECT coalesce(max(rank),0)::bigint FROM issues WHERE project_id=$1 AND status=$2;

-- name: RebalanceColumnRanks :exec
WITH positions AS (
  SELECT ordered.id,(row_number() OVER (ORDER BY ordered.rank,ordered.number)*1024)::bigint AS new_rank
  FROM issues ordered WHERE ordered.project_id=$1 AND ordered.status=$2
)
UPDATE issues i SET rank=p.new_rank FROM positions p WHERE i.id=p.id;

-- name: CountColumnForRebalance :one
SELECT count(*)::bigint FROM (SELECT id FROM issues WHERE project_id=$1 AND status=$2 LIMIT 2001) bounded;

-- name: AdvanceColumnOrder :one
UPDATE project_status_order SET revision=revision+1 WHERE project_id=$1 AND status=$2 RETURNING revision;

-- name: RankBefore :one
SELECT coalesce(max(rank),0)::bigint FROM issues
WHERE project_id=$1 AND status=$2 AND rank<$3 AND id<>$4;

-- name: RankAfter :one
SELECT coalesce(min(rank),0)::bigint FROM issues
WHERE project_id=$1 AND status=$2 AND rank>$3 AND id<>$4;
