-- +goose Up
ALTER TABLE projects ADD COLUMN backlog_revision bigint NOT NULL DEFAULT 1 CHECK(backlog_revision>0);
ALTER TABLE issues ADD COLUMN backlog_rank bigint NOT NULL DEFAULT 0;
WITH positions AS (SELECT id,row_number() OVER(PARTITION BY project_id ORDER BY created_at,id)*1024 AS position FROM issues)
UPDATE issues SET backlog_rank=positions.position FROM positions WHERE issues.id=positions.id;
CREATE INDEX issues_backlog_order ON issues(project_id,backlog_rank,id) WHERE backlog AND NOT archived;
CREATE TABLE issue_import_sources (
 project_id uuid NOT NULL REFERENCES projects(id),source_key text NOT NULL CHECK(char_length(source_key) BETWEEN 1 AND 200),
 issue_id uuid NOT NULL REFERENCES issues(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,source_key)
);
CREATE TABLE development_links (
 id uuid PRIMARY KEY,issue_id uuid NOT NULL REFERENCES issues(id),url text NOT NULL CHECK(char_length(url) BETWEEN 1 AND 2000),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),kind text NOT NULL CHECK(kind IN('pull_request','commit','other')),
 revision bigint NOT NULL DEFAULT 1,removed boolean NOT NULL DEFAULT false,created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX development_links_issue ON development_links(issue_id,created_at,id) WHERE NOT removed;
CREATE TABLE project_assignment_rules (
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 100),
 stage text NOT NULL,assignee_id uuid NOT NULL REFERENCES users(id),enabled boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_assignment_rule_stage ON project_assignment_rules(project_id,stage) WHERE enabled;
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retained planning/import/development history requires a forward-compatible rollback'; END $$;
-- +goose StatementEnd
