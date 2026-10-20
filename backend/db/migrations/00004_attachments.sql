-- +goose Up
CREATE TABLE attachments (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL,
 issue_id uuid NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
 mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
 checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
 staging_key text NOT NULL UNIQUE,
 staging_generation bigint NOT NULL CHECK (staging_generation > 0),
 published_key text NOT NULL UNIQUE,
 published_generation bigint NOT NULL CHECK (published_generation > 0),
 attached boolean NOT NULL DEFAULT true,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX attachments_issue_page_idx ON attachments(issue_id,uploaded_at,id) WHERE attached;
CREATE TABLE attachment_upload_reservations (
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 retry_reference uuid NOT NULL,
 command_hash text NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
 attachment_id uuid NOT NULL UNIQUE,
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
 PRIMARY KEY(actor_id,retry_reference),
 FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id) ON DELETE RESTRICT,
 CHECK (state NOT IN ('ready','committed') OR (staging_generation IS NOT NULL AND checksum IS NOT NULL AND published_key IS NOT NULL AND published_generation IS NOT NULL))
);
CREATE INDEX attachment_reservations_cleanup_idx ON attachment_upload_reservations(state,updated_at,attachment_id);
-- +goose StatementBegin
CREATE FUNCTION preserve_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'attached') IS DISTINCT FROM (to_jsonb(OLD)-'attached') THEN
  RAISE EXCEPTION 'attachment bytes and attribution are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER attachments_immutable BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION preserve_attachment();
CREATE TRIGGER attachments_retained BEFORE DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION immutable_history();
-- +goose Down
DROP TABLE attachment_upload_reservations;
DROP TABLE attachments;
DROP FUNCTION preserve_attachment();
