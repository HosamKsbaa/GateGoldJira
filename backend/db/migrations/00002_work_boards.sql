-- +goose Up
CREATE TABLE issues (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  number bigint NOT NULL CHECK (number > 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  type text NOT NULL DEFAULT 'task' CHECK (type IN ('task','bug','subtask')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done')),
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assignee_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  due_date date,
  parent_id uuid,
  rank bigint NOT NULL CHECK (rank > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, parent_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK ((type = 'subtask') = (parent_id IS NOT NULL)),
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX issues_modified_page_idx ON issues (project_id, updated_at DESC, id DESC);
CREATE INDEX issues_status_rank_idx ON issues (project_id, status, rank, number);
CREATE INDEX issues_assignee_page_idx ON issues (assignee_id, updated_at DESC, id DESC);
CREATE INDEX issues_parent_idx ON issues (project_id, parent_id, status) WHERE parent_id IS NOT NULL;
CREATE INDEX issues_due_date_idx ON issues (project_id, due_date, id) WHERE due_date IS NOT NULL;
CREATE INDEX issues_title_search_idx ON issues USING gin (title gin_trgm_ops);

CREATE TABLE labels (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  name_key text NOT NULL CHECK (name_key <> ''),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name_key),
  UNIQUE (project_id, id)
);
CREATE TABLE issue_labels (
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  label_id uuid NOT NULL,
  PRIMARY KEY (issue_id, label_id),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, label_id) REFERENCES labels (project_id, id) ON DELETE RESTRICT
);
CREATE INDEX issue_labels_filter_idx ON issue_labels (project_id, label_id, issue_id);

CREATE TABLE issue_dependencies (
  project_id uuid NOT NULL,
  dependent_id uuid NOT NULL,
  blocker_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  removed_at timestamptz,
  PRIMARY KEY (dependent_id, blocker_id),
  FOREIGN KEY (project_id, dependent_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, blocker_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK (dependent_id <> blocker_id),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX dependencies_blocker_active_idx ON issue_dependencies (project_id, blocker_id, dependent_id) WHERE removed_at IS NULL;
CREATE INDEX dependencies_dependent_active_idx ON issue_dependencies (project_id, dependent_id, blocker_id) WHERE removed_at IS NULL;

CREATE TABLE boards (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  name_key text NOT NULL CHECK (name_key <> ''),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  saved_filters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(saved_filters) = 'object'),
  filters_version integer NOT NULL DEFAULT 1 CHECK (filters_version = 1),
  in_progress_limit integer CHECK (in_progress_limit BETWEEN 1 AND 1000),
  review_limit integer CHECK (review_limit BETWEEN 1 AND 1000),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name_key),
  UNIQUE (project_id, id),
  CHECK (NOT is_default OR (name = 'All Issues' AND name_key = 'all issues' AND saved_filters = '{}' AND archived_at IS NULL))
);
CREATE UNIQUE INDEX boards_one_default_idx ON boards (project_id) WHERE is_default;
CREATE INDEX boards_name_page_idx ON boards (project_id, name_key, id);

-- +goose StatementBegin
CREATE FUNCTION preserve_issue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.number IS DISTINCT FROM OLD.number OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'issue attribution and relationship are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER issues_identity BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION preserve_issue_identity();

-- +goose Down
DROP TABLE boards;
DROP TABLE issue_dependencies;
DROP TABLE issue_labels;
DROP TABLE labels;
DROP TABLE issues;
DROP FUNCTION preserve_issue_identity();
