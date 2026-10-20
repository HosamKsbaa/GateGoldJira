-- +goose Up
CREATE TABLE field_definitions (
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),key text NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,31}$'),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),value_kind text NOT NULL CHECK(value_kind IN('text','number','date','choice','user')),
 required boolean NOT NULL DEFAULT false,retired boolean NOT NULL DEFAULT false,
 default_text text CHECK(char_length(default_text)<=5000),default_number numeric CHECK(default_number IS NULL OR (default_number<>'NaN'::numeric AND abs(default_number)<1e28::numeric AND scale(default_number)<=10)),default_date date CHECK(default_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),default_option_id uuid,default_user_id uuid REFERENCES users(id),
 UNIQUE(project_id,id),UNIQUE(project_id,key),UNIQUE(project_id,id,value_kind),CHECK(NOT(required AND retired)),
 CHECK((default_text IS NULL AND default_number IS NULL AND default_date IS NULL AND default_option_id IS NULL AND default_user_id IS NULL)
 OR (value_kind='text' AND default_text IS NOT NULL AND default_number IS NULL AND default_date IS NULL AND default_option_id IS NULL AND default_user_id IS NULL)
 OR (value_kind='number' AND default_text IS NULL AND default_number IS NOT NULL AND default_date IS NULL AND default_option_id IS NULL AND default_user_id IS NULL)
 OR (value_kind='date' AND default_text IS NULL AND default_number IS NULL AND default_date IS NOT NULL AND default_option_id IS NULL AND default_user_id IS NULL)
 OR (value_kind='choice' AND default_text IS NULL AND default_number IS NULL AND default_date IS NULL AND default_option_id IS NOT NULL AND default_user_id IS NULL)
 OR (value_kind='user' AND default_text IS NULL AND default_number IS NULL AND default_date IS NULL AND default_option_id IS NULL AND default_user_id IS NOT NULL))
);
CREATE INDEX field_definitions_page ON field_definitions(project_id,id);
CREATE TABLE field_options (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,field_id uuid NOT NULL,value_kind text NOT NULL DEFAULT 'choice' CHECK(value_kind='choice'),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),position bigint NOT NULL CHECK(position>0),retired boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,field_id,id),UNIQUE(field_id,position) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(project_id,field_id,value_kind) REFERENCES field_definitions(project_id,id,value_kind)
);
CREATE INDEX field_options_page ON field_options(project_id,field_id,position,id);
ALTER TABLE field_definitions ADD CONSTRAINT field_default_option_scope FOREIGN KEY(project_id,id,default_option_id) REFERENCES field_options(project_id,field_id,id);
CREATE TABLE issue_field_values (
 project_id uuid NOT NULL,issue_id uuid NOT NULL,field_id uuid NOT NULL,value_kind text NOT NULL,
 text_value text CHECK(char_length(text_value)<=5000),number_value numeric CHECK(number_value IS NULL OR (number_value<>'NaN'::numeric AND abs(number_value)<1e28::numeric AND scale(number_value)<=10)),date_value date CHECK(date_value BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),option_id uuid,user_id uuid REFERENCES users(id),
 PRIMARY KEY(issue_id,field_id),FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),
 FOREIGN KEY(project_id,field_id,value_kind) REFERENCES field_definitions(project_id,id,value_kind),
 FOREIGN KEY(project_id,field_id,option_id) REFERENCES field_options(project_id,field_id,id),
 CHECK((value_kind='text' AND text_value IS NOT NULL AND number_value IS NULL AND date_value IS NULL AND option_id IS NULL AND user_id IS NULL)
 OR (value_kind='number' AND text_value IS NULL AND number_value IS NOT NULL AND date_value IS NULL AND option_id IS NULL AND user_id IS NULL)
 OR (value_kind='date' AND text_value IS NULL AND number_value IS NULL AND date_value IS NOT NULL AND option_id IS NULL AND user_id IS NULL)
 OR (value_kind='choice' AND text_value IS NULL AND number_value IS NULL AND date_value IS NULL AND option_id IS NOT NULL AND user_id IS NULL)
 OR (value_kind='user' AND text_value IS NULL AND number_value IS NULL AND date_value IS NULL AND option_id IS NULL AND user_id IS NOT NULL))
);
CREATE INDEX issue_field_definition_values ON issue_field_values(project_id,field_id,issue_id);
CREATE TABLE transition_required_fields (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,workflow_id uuid NOT NULL,transition_id uuid NOT NULL,
 system_field text CHECK(system_field IN('assignee','due_date','description')),field_id uuid,
 CHECK((system_field IS NULL)<>(field_id IS NULL)),
 FOREIGN KEY(project_id,workflow_id,transition_id) REFERENCES workflow_transitions(project_id,workflow_id,id),
 FOREIGN KEY(project_id,field_id) REFERENCES field_definitions(project_id,id)
);
CREATE UNIQUE INDEX transition_required_system ON transition_required_fields(transition_id,system_field) WHERE system_field IS NOT NULL;
CREATE UNIQUE INDEX transition_required_custom ON transition_required_fields(transition_id,field_id) WHERE field_id IS NOT NULL;
CREATE INDEX transition_required_field_usage ON transition_required_fields(project_id,field_id,transition_id) WHERE field_id IS NOT NULL;
CREATE TABLE issue_approvals (
 project_id uuid NOT NULL,issue_id uuid NOT NULL,transition_id uuid NOT NULL,
 issue_revision bigint NOT NULL CHECK(issue_revision>0),workflow_revision bigint NOT NULL CHECK(workflow_revision>0),configuration_revision bigint NOT NULL CHECK(configuration_revision>0),
 approver_id uuid NOT NULL REFERENCES users(id),decision text NOT NULL CHECK(decision IN('approve','reject')),decided_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,approver_id),
 FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),FOREIGN KEY(project_id,transition_id) REFERENCES workflow_transitions(project_id,id)
);
CREATE INDEX issue_approvals_history ON issue_approvals(issue_id,transition_id,decided_at DESC,approver_id DESC,issue_revision DESC,workflow_revision DESC,configuration_revision DESC);
-- +goose StatementBegin
CREATE FUNCTION preserve_field_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.key IS DISTINCT FROM OLD.key THEN
  RAISE EXCEPTION 'field identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.value_kind IS DISTINCT FROM OLD.value_kind AND (
  EXISTS(SELECT 1 FROM issue_field_values WHERE field_id=OLD.id) OR EXISTS(SELECT 1 FROM field_options WHERE field_id=OLD.id)
  OR EXISTS(SELECT 1 FROM transition_required_fields WHERE field_id=OLD.id)) THEN
  RAISE EXCEPTION 'used field kind is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION preserve_field_option_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.field_id IS DISTINCT FROM OLD.field_id OR NEW.value_kind IS DISTINCT FROM OLD.value_kind THEN
  RAISE EXCEPTION 'field option ownership is immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END;
$$;
CREATE FUNCTION preserve_approval_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'approval decisions are retained; resubmit instead' USING ERRCODE='23514';END;
$$;
-- +goose StatementEnd
CREATE TRIGGER field_identity BEFORE UPDATE ON field_definitions FOR EACH ROW EXECUTE FUNCTION preserve_field_identity();
CREATE TRIGGER field_option_identity BEFORE UPDATE ON field_options FOR EACH ROW EXECUTE FUNCTION preserve_field_option_identity();
CREATE TRIGGER approval_history BEFORE UPDATE OR DELETE ON issue_approvals FOR EACH ROW EXECUTE FUNCTION preserve_approval_history();

-- +goose Down
DROP TRIGGER approval_history ON issue_approvals;
DROP TRIGGER field_option_identity ON field_options;
DROP TRIGGER field_identity ON field_definitions;
DROP FUNCTION preserve_approval_history();
DROP FUNCTION preserve_field_option_identity();
DROP FUNCTION preserve_field_identity();
DROP TABLE issue_approvals,transition_required_fields,issue_field_values;
ALTER TABLE field_definitions DROP CONSTRAINT field_default_option_scope;
DROP TABLE field_options,field_definitions;
