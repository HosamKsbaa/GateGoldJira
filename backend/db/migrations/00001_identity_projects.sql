-- +goose Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE company_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  time_zone text NOT NULL DEFAULT 'Africa/Cairo'
);
INSERT INTO company_settings (singleton) VALUES (true);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  email_key text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  approved_at timestamptz,
  disabled_at timestamptz,
  is_administrator boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(email) BETWEEN 3 AND 320),
  CHECK (email_key <> '')
);
CREATE INDEX users_active_admin_idx ON users (id)
  WHERE is_administrator AND approved_at IS NOT NULL AND disabled_at IS NULL;

CREATE TABLE user_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  bound_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  CHECK (issuer <> '' AND subject <> '')
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  next_issue_number bigint NOT NULL DEFAULT 1 CHECK (next_issue_number > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  graph_revision bigint NOT NULL DEFAULT 1 CHECK (graph_revision > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_name_page_idx ON projects (name, id);

CREATE TABLE project_memberships (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('member','viewer')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_memberships_user_active_idx ON project_memberships (user_id, project_id) WHERE removed_at IS NULL;

CREATE TABLE project_status_order (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('todo','in_progress','review','done')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (project_id, status)
);

-- Historical identity and project keys never change after creation.
-- +goose StatementBegin
CREATE FUNCTION preserve_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'record identifier is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'projects' AND to_jsonb(NEW)->'key' IS DISTINCT FROM to_jsonb(OLD)->'key' THEN
    RAISE EXCEPTION 'project key is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER users_identity BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION preserve_identity();
CREATE TRIGGER projects_identity BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION preserve_identity();

-- +goose Down
DROP TABLE project_status_order;
DROP TABLE project_memberships;
DROP TABLE projects;
DROP TABLE user_identities;
DROP TABLE users;
DROP TABLE company_settings;
DROP FUNCTION preserve_identity();
