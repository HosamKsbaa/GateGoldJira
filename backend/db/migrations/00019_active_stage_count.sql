-- +goose Up
-- Compact repeated project/stage keys permit an index-only count. Including
-- per-issue IDs/timestamps defeats btree deduplication for broad board reads.
CREATE INDEX issues_active_stage_count ON issue_records(project_id,stage_id)
WHERE NOT archived AND NOT backlog;

-- +goose Down
DROP INDEX issues_active_stage_count;
