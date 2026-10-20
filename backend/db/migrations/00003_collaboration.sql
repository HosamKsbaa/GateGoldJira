-- +goose Up
ALTER TABLE company_settings ADD COLUMN cleanup_paused boolean NOT NULL DEFAULT false;

CREATE TABLE pictures (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  staging_key text NOT NULL UNIQUE,
  staging_generation bigint NOT NULL CHECK (staging_generation > 0),
  published_key text UNIQUE,
  published_generation bigint CHECK (published_generation > 0),
  state text NOT NULL CHECK (state IN ('draft','published','expired')),
  in_gallery boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  published_at timestamptz,
  UNIQUE (issue_id, id),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK (expires_at = uploaded_at + interval '24 hours'),
  CHECK ((state = 'published') = (published_key IS NOT NULL AND published_generation IS NOT NULL AND published_at IS NOT NULL)),
  CHECK (NOT in_gallery OR state = 'published')
);
CREATE INDEX pictures_gallery_page_idx ON pictures (issue_id, uploaded_at, id) WHERE in_gallery;
CREATE INDEX pictures_expiry_idx ON pictures (expires_at, id) WHERE state = 'draft';

CREATE TABLE upload_reservations (
  actor_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  retry_reference uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  picture_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  staging_key text NOT NULL UNIQUE,
  staging_generation bigint CHECK (staging_generation > 0),
  published_key text,
  published_generation bigint CHECK (published_generation > 0),
  lease_until timestamptz NOT NULL,
  checksum text CHECK (checksum ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('uploading','ready','failed','committed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, retry_reference),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK (state NOT IN ('ready','committed') OR (staging_generation IS NOT NULL AND checksum IS NOT NULL))
);
CREATE INDEX upload_reservations_cleanup_idx ON upload_reservations (state, lease_until, picture_id);

CREATE TABLE comments (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  UNIQUE (issue_id, id),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT
);
CREATE INDEX comments_discussion_page_idx ON comments (issue_id, created_at, id);

CREATE TABLE comment_versions (
  comment_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  issue_id uuid NOT NULL,
  safe_html text NOT NULL CHECK (octet_length(safe_html) <= 65536),
  plain_text text NOT NULL CHECK (char_length(plain_text) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, revision),
  UNIQUE (comment_id, revision, issue_id),
  FOREIGN KEY (issue_id, comment_id) REFERENCES comments (issue_id, id) ON DELETE RESTRICT
);
ALTER TABLE comments ADD CONSTRAINT comments_current_version_fk
  FOREIGN KEY (id, revision) REFERENCES comment_versions (comment_id, revision)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE comment_version_pictures (
  comment_id uuid NOT NULL,
  version bigint NOT NULL,
  issue_id uuid NOT NULL,
  picture_id uuid NOT NULL,
  PRIMARY KEY (comment_id, version, picture_id),
  FOREIGN KEY (comment_id, version, issue_id) REFERENCES comment_versions (comment_id, revision, issue_id) ON DELETE RESTRICT,
  FOREIGN KEY (issue_id, picture_id) REFERENCES pictures (issue_id, id) ON DELETE RESTRICT
);
CREATE TABLE comment_version_mentions (
  comment_id uuid NOT NULL,
  version bigint NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  display_label_snapshot text NOT NULL CHECK (char_length(display_label_snapshot) BETWEEN 1 AND 100),
  PRIMARY KEY (comment_id, version, user_id),
  FOREIGN KEY (comment_id, version) REFERENCES comment_versions (comment_id, revision) ON DELETE RESTRICT
);

CREATE TABLE activity_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('web','mcp')),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  resource_kind text NOT NULL CHECK (char_length(resource_kind) BETWEEN 1 AND 50),
  resource_id uuid NOT NULL,
  project_id uuid REFERENCES projects (id) ON DELETE RESTRICT,
  issue_id uuid,
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK (issue_id IS NULL OR project_id IS NOT NULL)
);
CREATE INDEX activity_events_project_page_idx ON activity_events (project_id, created_at DESC, id DESC);
CREATE INDEX activity_events_issue_page_idx ON activity_events (issue_id, created_at DESC, id DESC);
CREATE INDEX activity_events_company_page_idx ON activity_events (created_at DESC, id DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES activity_events (id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reasons text[] NOT NULL CHECK (cardinality(reasons) BETWEEN 1 AND 9),
  plain_text_summary text NOT NULL CHECK (char_length(plain_text_summary) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (event_id, issue_id, recipient_id),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues (project_id, id) ON DELETE RESTRICT,
  CHECK (recipient_id <> actor_id),
  CHECK (reasons <@ ARRAY['comment','mention','assignment','status','due_date','dependency_blocked','dependency_resolved','subtask_created','subtasks_completed']::text[])
);
CREATE INDEX notifications_inbox_page_idx ON notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (recipient_id, project_id) WHERE read_at IS NULL;

CREATE TABLE idempotency_records (
  actor_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  retry_reference uuid NOT NULL,
  operation text NOT NULL,
  canonical_input_hash text NOT NULL CHECK (canonical_input_hash ~ '^[0-9a-f]{64}$'),
  result jsonb,
  result_version integer NOT NULL DEFAULT 1 CHECK (result_version = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  PRIMARY KEY (actor_id, retry_reference),
  CHECK (expires_at >= created_at + interval '48 hours')
);
CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at, actor_id, retry_reference);

-- +goose StatementBegin
CREATE FUNCTION immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE FUNCTION preserve_comment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'comment attribution is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION preserve_published_picture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'published' AND (to_jsonb(NEW) - 'in_gallery') IS DISTINCT FROM (to_jsonb(OLD) - 'in_gallery') THEN
    RAISE EXCEPTION 'published picture is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER comments_identity BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION preserve_comment_identity();
CREATE TRIGGER comment_versions_immutable BEFORE UPDATE OR DELETE ON comment_versions FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER comment_version_pictures_immutable BEFORE UPDATE OR DELETE ON comment_version_pictures FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER comment_version_mentions_immutable BEFORE UPDATE OR DELETE ON comment_version_mentions FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER activity_events_immutable BEFORE UPDATE OR DELETE ON activity_events FOR EACH ROW EXECUTE FUNCTION immutable_history();
CREATE TRIGGER pictures_published_immutable BEFORE UPDATE ON pictures FOR EACH ROW EXECUTE FUNCTION preserve_published_picture();

-- +goose Down
ALTER TABLE comments DROP CONSTRAINT comments_current_version_fk;
DROP TABLE idempotency_records;
DROP TABLE notifications;
DROP TABLE activity_events;
DROP TABLE comment_version_mentions;
DROP TABLE comment_version_pictures;
DROP TABLE comment_versions;
DROP TABLE comments;
DROP TABLE upload_reservations;
DROP TABLE pictures;
DROP FUNCTION immutable_history();
DROP FUNCTION preserve_comment_identity();
DROP FUNCTION preserve_published_picture();
ALTER TABLE company_settings DROP COLUMN cleanup_paused;
