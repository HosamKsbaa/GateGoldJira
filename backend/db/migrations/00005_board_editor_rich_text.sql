-- +goose Up
ALTER TABLE issues ADD COLUMN description_format text NOT NULL DEFAULT 'plain'
  CHECK (description_format IN ('plain','html'));
ALTER TABLE boards ADD COLUMN workflow jsonb NOT NULL DEFAULT '{"columns":[{"status":"todo","name":"To do","allowedTargets":["in_progress","review","done"]},{"status":"in_progress","name":"In progress","allowedTargets":["todo","review","done"]},{"status":"review","name":"Review","allowedTargets":["todo","in_progress","done"]},{"status":"done","name":"Done","allowedTargets":["todo","in_progress","review"]}]}'::jsonb
  CHECK (CASE WHEN jsonb_typeof(workflow->'columns')='array' THEN jsonb_array_length(workflow->'columns')>=4 ELSE false END);


ALTER TABLE project_status_order DROP CONSTRAINT project_status_order_status_check;
ALTER TABLE issues DROP CONSTRAINT issues_status_check;
ALTER TABLE project_status_order ADD CONSTRAINT project_status_order_status_check CHECK (status ~ '^(todo|in_progress|review|done)(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$');
ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status ~ '^(todo|in_progress|review|done)(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$');
ALTER TABLE project_status_order ADD COLUMN stage_name text NOT NULL DEFAULT '' CHECK (char_length(stage_name)<=60);
UPDATE project_status_order SET stage_name=CASE status WHEN 'todo' THEN 'To do' WHEN 'in_progress' THEN 'In progress' WHEN 'review' THEN 'Review' ELSE 'Done' END;
-- +goose StatementBegin
CREATE FUNCTION require_custom_issue_stage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF strpos(NEW.status,':')>0 AND NOT EXISTS(SELECT 1 FROM project_status_order WHERE project_id=NEW.project_id AND status=NEW.status) THEN
  RAISE EXCEPTION 'custom stage must belong to the issue project' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER issues_registered_stage BEFORE INSERT OR UPDATE OF status,project_id ON issues FOR EACH ROW EXECUTE FUNCTION require_custom_issue_stage();

ALTER TABLE attachments DROP CONSTRAINT attachments_mime_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_mime_type_check CHECK (mime_type IN ('application/octet-stream','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

-- +goose Down
ALTER TABLE attachments DROP CONSTRAINT attachments_mime_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_mime_type_check CHECK (mime_type IN ('application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
DROP TRIGGER issues_registered_stage ON issues;
DROP FUNCTION require_custom_issue_stage();
ALTER TABLE project_status_order DROP COLUMN stage_name;
ALTER TABLE issues DROP CONSTRAINT issues_status_check;
ALTER TABLE project_status_order DROP CONSTRAINT project_status_order_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status IN ('todo','in_progress','review','done'));
ALTER TABLE project_status_order ADD CONSTRAINT project_status_order_status_check CHECK (status IN ('todo','in_progress','review','done'));
ALTER TABLE boards DROP COLUMN workflow;
ALTER TABLE issues DROP COLUMN description_format;
