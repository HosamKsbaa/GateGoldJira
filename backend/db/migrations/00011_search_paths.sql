-- +goose Up
-- Project-local numbering already has a unique index; this supports exact
-- numbers across the caller's accessible projects without casting stored data.
CREATE INDEX issues_number_lookup ON issues(number,project_id,id);
-- The global default list must seek by time independently of project filters.
CREATE INDEX issues_updated_global ON issues(updated_at DESC,id DESC);

-- +goose Down
DROP INDEX issues_updated_global;
DROP INDEX issues_number_lookup;
