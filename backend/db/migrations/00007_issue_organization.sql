-- +goose Up
ALTER TABLE issues ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE issues ADD COLUMN backlog boolean NOT NULL DEFAULT false;
CREATE INDEX issues_active_project ON issues(project_id,updated_at DESC,id DESC) WHERE NOT archived;
CREATE TABLE issue_watchers (
 issue_id uuid NOT NULL REFERENCES issues(id), user_id uuid NOT NULL REFERENCES users(id),
 watching boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issue_id,user_id)
);
CREATE TABLE issue_links (
 issue_id uuid NOT NULL REFERENCES issues(id), target_id uuid NOT NULL REFERENCES issues(id),
 kind text NOT NULL CHECK(kind IN ('relates_to','duplicates')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz, PRIMARY KEY(issue_id,target_id,kind), CHECK(issue_id<>target_id)
);
CREATE INDEX issue_links_target ON issue_links(target_id) WHERE removed_at IS NULL;
CREATE TABLE saved_issue_searches (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 80), filters jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1, removed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_issue_search_names ON saved_issue_searches(user_id,lower(name)) WHERE NOT removed;
ALTER TABLE notifications DROP CONSTRAINT notifications_reasons_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_reasons_check CHECK(cardinality(reasons) BETWEEN 1 AND 10);
ALTER TABLE notifications DROP CONSTRAINT notifications_reasons_check1;
ALTER TABLE notifications ADD CONSTRAINT notifications_reasons_check1 CHECK(reasons <@ ARRAY['comment','mention','assignment','status','due_date','dependency_blocked','dependency_resolved','subtask_created','subtasks_completed','watching']::text[]);
-- These records have retained identities. Application rollback must not delete them.
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retained organization records require a forward-compatible rollback'; END $$;
-- +goose StatementEnd
