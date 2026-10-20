-- +goose Up
-- Expand only. Legacy columns/contracts remain available while bridges keep
-- canonical references current; retirement is a separately verified cutover.
ALTER TABLE project_memberships DROP CONSTRAINT project_memberships_role_check;
ALTER TABLE project_memberships ADD CONSTRAINT project_memberships_role_check CHECK(role IN('project_admin','member','viewer'));

ALTER TABLE projects ADD COLUMN configuration_revision bigint NOT NULL DEFAULT 1 CHECK(configuration_revision>0);
ALTER TABLE projects ADD COLUMN core_mode text NOT NULL DEFAULT 'legacy' CHECK(core_mode IN('legacy','modern'));

CREATE TABLE workflows (
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 100),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),retired boolean NOT NULL DEFAULT false,
 legacy_default boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,id)
);
CREATE UNIQUE INDEX workflows_names ON workflows(project_id,lower(name));
CREATE UNIQUE INDEX workflows_legacy_bridge ON workflows(project_id) WHERE legacy_default;

CREATE TABLE workflow_stages (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,workflow_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 category text NOT NULL CHECK(category IN('todo','in_progress','review','done')),
 legacy_status text NOT NULL CHECK(legacy_status ~ '^(todo|in_progress|review|done)(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'),
 position bigint NOT NULL CHECK(position>0),is_initial boolean NOT NULL DEFAULT false,
 accepts_entries boolean NOT NULL DEFAULT true,retired boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,id),UNIQUE(project_id,workflow_id,id),UNIQUE(project_id,legacy_status),
 FOREIGN KEY(project_id,workflow_id) REFERENCES workflows(project_id,id),
 CHECK(NOT is_initial OR (NOT retired AND accepts_entries)),CHECK(NOT retired OR NOT accepts_entries)
);
CREATE UNIQUE INDEX workflow_initial_stage ON workflow_stages(workflow_id) WHERE is_initial AND NOT retired;
CREATE INDEX workflow_stage_list ON workflow_stages(workflow_id,position,id);

CREATE TABLE workflow_transitions (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,workflow_id uuid NOT NULL,
 from_stage_id uuid NOT NULL,to_stage_id uuid NOT NULL,
 required_permission text CHECK(required_permission IN('member','project_admin')),
 approvals_required smallint NOT NULL DEFAULT 0 CHECK(approvals_required BETWEEN 0 AND 100),
 approver_role text CHECK(approver_role IN('member','project_admin')),
 exclude_issue_reporter boolean NOT NULL DEFAULT false,retired boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,id),UNIQUE(project_id,workflow_id,id),UNIQUE(workflow_id,from_stage_id,to_stage_id),
 FOREIGN KEY(project_id,workflow_id,from_stage_id) REFERENCES workflow_stages(project_id,workflow_id,id),
 FOREIGN KEY(project_id,workflow_id,to_stage_id) REFERENCES workflow_stages(project_id,workflow_id,id),
 CHECK(from_stage_id<>to_stage_id),CHECK((approvals_required=0)=(approver_role IS NULL))
);
CREATE INDEX workflow_transitions_active ON workflow_transitions(workflow_id,from_stage_id,to_stage_id) WHERE NOT retired;

CREATE TABLE issue_types (
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),
 key text NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,31}$'),name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 behavior text NOT NULL CHECK(behavior IN('standard','subtask')),
 is_default boolean NOT NULL DEFAULT false,retired boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,id),UNIQUE(project_id,key),CHECK(NOT is_default OR NOT retired)
);
CREATE UNIQUE INDEX issue_type_default ON issue_types(project_id,behavior) WHERE is_default;
CREATE TABLE priorities (
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),
 key text NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,31}$'),name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 sort_order bigint NOT NULL CHECK(sort_order>0),is_default boolean NOT NULL DEFAULT false,retired boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,id),UNIQUE(project_id,key),CHECK(NOT is_default OR NOT retired)
);
CREATE UNIQUE INDEX priority_default ON priorities(project_id) WHERE is_default;
CREATE INDEX priorities_order ON priorities(project_id,sort_order,id);
CREATE TABLE issue_type_workflows (
 project_id uuid NOT NULL,type_id uuid NOT NULL,workflow_id uuid NOT NULL,
 is_default boolean NOT NULL DEFAULT false,accepts_new boolean NOT NULL DEFAULT true,
 PRIMARY KEY(project_id,type_id,workflow_id),
 FOREIGN KEY(project_id,type_id) REFERENCES issue_types(project_id,id),
 FOREIGN KEY(project_id,workflow_id) REFERENCES workflows(project_id,id),CHECK(NOT is_default OR accepts_new)
);
CREATE UNIQUE INDEX issue_type_workflow_default ON issue_type_workflows(project_id,type_id) WHERE is_default;

ALTER TABLE issues ADD COLUMN type_id uuid;
ALTER TABLE issues ADD COLUMN priority_id uuid;
ALTER TABLE issues ADD COLUMN workflow_id uuid;
ALTER TABLE issues ADD COLUMN stage_id uuid;
ALTER TABLE issues ADD CONSTRAINT issue_canonical_shape CHECK(
 (type_id IS NULL AND priority_id IS NULL AND workflow_id IS NULL AND stage_id IS NULL) OR
 (type_id IS NOT NULL AND priority_id IS NOT NULL AND workflow_id IS NOT NULL AND stage_id IS NOT NULL));
ALTER TABLE issues ADD CONSTRAINT issue_type_workflow_scope FOREIGN KEY(project_id,type_id,workflow_id) REFERENCES issue_type_workflows(project_id,type_id,workflow_id);
ALTER TABLE issues ADD CONSTRAINT issue_workflow_stage_scope FOREIGN KEY(project_id,workflow_id,stage_id) REFERENCES workflow_stages(project_id,workflow_id,id);
ALTER TABLE issues ADD CONSTRAINT issue_priority_scope FOREIGN KEY(project_id,priority_id) REFERENCES priorities(project_id,id);
CREATE INDEX issues_stage_usage ON issues(project_id,workflow_id,stage_id,id);
CREATE INDEX issues_type_usage ON issues(project_id,type_id,id);
CREATE INDEX issues_priority_usage ON issues(project_id,priority_id,id);
ALTER TABLE project_assignment_rules ADD COLUMN stage_id uuid;
ALTER TABLE project_assignment_rules ADD CONSTRAINT assignment_stage_scope FOREIGN KEY(project_id,stage_id) REFERENCES workflow_stages(project_id,id);

-- +goose StatementBegin
CREATE FUNCTION seed_legacy_configuration(p_project uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE flow uuid;
BEGIN
 INSERT INTO workflows(id,project_id,name,legacy_default)
 VALUES(gen_random_uuid(),p_project,'Default workflow',true) ON CONFLICT DO NOTHING;
 SELECT id INTO STRICT flow FROM workflows WHERE project_id=p_project AND legacy_default;
 INSERT INTO issue_types(id,project_id,key,name,behavior,is_default)
 SELECT gen_random_uuid(),p_project,key,name,behavior,is_default FROM
 (VALUES('task','Task','standard',true),('bug','Bug','standard',false),('subtask','Subtask','subtask',true)) v(key,name,behavior,is_default)
 ON CONFLICT(project_id,key) DO NOTHING;
 INSERT INTO priorities(id,project_id,key,name,sort_order,is_default)
 SELECT gen_random_uuid(),p_project,key,name,position,is_default FROM
 (VALUES('low','Low',1,false),('medium','Medium',2,true),('high','High',3,false)) v(key,name,position,is_default)
 ON CONFLICT(project_id,key) DO NOTHING;
 INSERT INTO issue_type_workflows(project_id,type_id,workflow_id,is_default,accepts_new)
 SELECT p_project,id,flow,true,true FROM issue_types WHERE project_id=p_project
 ON CONFLICT(project_id,type_id,workflow_id) DO NOTHING;
 INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position,is_initial)
 SELECT gen_random_uuid(),p_project,flow,name,token,token,position,token='todo' FROM
 (VALUES('todo','To do',1),('in_progress','In progress',2),('review','Review',3),('done','Done',4)) v(token,name,position)
 ON CONFLICT(project_id,legacy_status) DO NOTHING;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION sync_legacy_workflow(p_project uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE flow uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=p_project AND core_mode='legacy') THEN RETURN; END IF;
 PERFORM seed_legacy_configuration(p_project);
 SELECT id INTO STRICT flow FROM workflows WHERE project_id=p_project AND legacy_default;
 -- Include tokens retained only by old layouts/orders/issue/rule references.
 -- Active configuration supplies entry eligibility; archived copies are history.
 INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position,retired,accepts_entries)
 SELECT gen_random_uuid(),p_project,flow,
 coalesce(nullif(o.stage_name,''),nullif(b.name,''),CASE split_part(tokens.status,':',1) WHEN 'todo' THEN 'To do' WHEN 'in_progress' THEN 'In progress' WHEN 'review' THEN 'Review' ELSE 'Done' END),
 split_part(tokens.status,':',1),tokens.status,4+row_number() OVER(ORDER BY tokens.status),
 NOT tokens.active,tokens.active
 FROM (
  SELECT status,bool_or(active) active FROM (
   SELECT o.status,NOT EXISTS(SELECT 1 FROM boards WHERE project_id=p_project AND archived_at IS NULL) active FROM project_status_order o WHERE o.project_id=p_project
   UNION ALL SELECT c->>'status',b.archived_at IS NULL FROM boards b CROSS JOIN LATERAL jsonb_array_elements(b.workflow->'columns') c WHERE b.project_id=p_project
   UNION ALL SELECT i.status,false FROM issues i WHERE i.project_id=p_project
   UNION ALL SELECT r.stage,false FROM project_assignment_rules r WHERE r.project_id=p_project
  ) found GROUP BY status
 ) tokens
 LEFT JOIN project_status_order o ON o.project_id=p_project AND o.status=tokens.status
 LEFT JOIN LATERAL (
  SELECT c->>'name' name FROM boards b CROSS JOIN LATERAL jsonb_array_elements(b.workflow->'columns') c
  WHERE b.project_id=p_project AND c->>'status'=tokens.status ORDER BY b.archived_at NULLS FIRST,b.is_default DESC,b.id LIMIT 1
 ) b ON true
 ON CONFLICT(project_id,legacy_status) DO NOTHING;
 -- Keep stable IDs; old base names may have been customized.
 UPDATE workflow_stages s SET name=o.stage_name FROM project_status_order o
 WHERE s.project_id=p_project AND o.project_id=p_project AND s.legacy_status=o.status AND o.stage_name<>'';
 UPDATE workflow_stages s SET retired=NOT s.is_initial AND EXISTS(SELECT 1 FROM boards WHERE project_id=p_project AND archived_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM boards b CROSS JOIN LATERAL jsonb_array_elements(b.workflow->'columns') c WHERE b.project_id=p_project AND b.archived_at IS NULL AND c->>'status'=s.legacy_status),
  accepts_entries=s.is_initial OR NOT EXISTS(SELECT 1 FROM boards WHERE project_id=p_project AND archived_at IS NULL)
  OR EXISTS(SELECT 1 FROM boards b CROSS JOIN LATERAL jsonb_array_elements(b.workflow->'columns') c WHERE b.project_id=p_project AND b.archived_at IS NULL AND c->>'status'=s.legacy_status)
 WHERE s.project_id=p_project AND s.workflow_id=flow;
 -- Current legacy moves must be permitted by every active board copy.
 UPDATE workflow_transitions SET retired=true WHERE project_id=p_project AND workflow_id=flow;
 INSERT INTO workflow_transitions(id,project_id,workflow_id,from_stage_id,to_stage_id)
 SELECT gen_random_uuid(),p_project,flow,source.id,target.id
 FROM workflow_stages source CROSS JOIN workflow_stages target
 WHERE source.project_id=p_project AND source.workflow_id=flow AND target.project_id=p_project AND target.workflow_id=flow
 AND NOT source.retired AND NOT target.retired AND source.id<>target.id
 AND NOT EXISTS(
  SELECT 1 FROM boards b WHERE b.project_id=p_project AND b.archived_at IS NULL AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(b.workflow->'columns') c WHERE c->>'status'=source.legacy_status
   AND (c->'allowedTargets') ? target.legacy_status
  )
 )
 ON CONFLICT(workflow_id,from_stage_id,to_stage_id) DO UPDATE SET retired=false;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT id FROM projects ORDER BY id LOOP PERFORM sync_legacy_workflow(p.id); END LOOP;
END $$;
-- +goose StatementEnd
-- The schema-owner migration runner calls this after expansion commits. Each
-- batch takes the legacy project guard before issue rows and preserves content
-- timestamps/revisions. The bridge triggers below cover concurrent old writers.
-- +goose StatementBegin
CREATE FUNCTION backfill_legacy_issue_configuration(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE selected_project uuid; affected integer;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'backfill batch must be 1-1000'; END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 SELECT p.id INTO selected_project FROM projects p
 WHERE EXISTS(SELECT 1 FROM issues i WHERE i.project_id=p.id AND i.type_id IS NULL)
 ORDER BY p.id LIMIT 1 FOR UPDATE;
 IF selected_project IS NULL THEN RETURN 0; END IF;
 WITH batch AS (SELECT id FROM issues WHERE project_id=selected_project AND type_id IS NULL ORDER BY id LIMIT p_limit FOR UPDATE)
 UPDATE issues i SET type_id=t.id,priority_id=p.id,workflow_id=w.id,stage_id=s.id
 FROM batch b,issue_types t,priorities p,workflows w,workflow_stages s
 WHERE i.id=b.id AND t.project_id=i.project_id AND t.key=i.type
  AND p.project_id=i.project_id AND p.key=i.priority AND w.project_id=i.project_id AND w.legacy_default
  AND s.project_id=i.project_id AND s.workflow_id=w.id AND s.legacy_status=i.status;
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected=0 THEN RAISE EXCEPTION 'legacy issue mapping is incomplete'; END IF;
 RETURN affected;
END;
$$;
-- +goose StatementEnd
REVOKE ALL ON FUNCTION backfill_legacy_issue_configuration(integer) FROM PUBLIC;
CREATE INDEX issues_configuration_backfill ON issues(project_id,id) WHERE type_id IS NULL;
UPDATE project_assignment_rules r SET stage_id=s.id FROM workflow_stages s WHERE s.project_id=r.project_id AND s.legacy_status=r.stage;

-- +goose StatementBegin
CREATE FUNCTION bridge_legacy_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM seed_legacy_configuration(NEW.id); RETURN NEW; END;
$$;
CREATE FUNCTION bridge_legacy_board() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM sync_legacy_workflow(NEW.project_id); RETURN NEW; END;
$$;
CREATE FUNCTION bridge_legacy_stage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='legacy') THEN
  PERFORM seed_legacy_configuration(NEW.project_id);
  INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position,is_initial)
  SELECT gen_random_uuid(),NEW.project_id,w.id,coalesce(nullif(NEW.stage_name,''),split_part(NEW.status,':',1)),split_part(NEW.status,':',1),NEW.status,
   coalesce((SELECT max(position)+1 FROM workflow_stages WHERE workflow_id=w.id),1),NEW.status='todo'
  FROM workflows w WHERE w.project_id=NEW.project_id AND w.legacy_default
  ON CONFLICT(project_id,legacy_status) DO UPDATE SET name=EXCLUDED.name;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION bridge_legacy_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='legacy') THEN
  SELECT t.id,p.id,w.id,s.id INTO STRICT NEW.type_id,NEW.priority_id,NEW.workflow_id,NEW.stage_id
  FROM issue_types t,priorities p,workflows w,workflow_stages s
  WHERE t.project_id=NEW.project_id AND t.key=NEW.type AND p.project_id=NEW.project_id AND p.key=NEW.priority
   AND w.project_id=NEW.project_id AND w.legacy_default AND s.project_id=NEW.project_id AND s.workflow_id=w.id AND s.legacy_status=NEW.status;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION bridge_legacy_assignment_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT id INTO STRICT NEW.stage_id FROM workflow_stages WHERE project_id=NEW.project_id AND legacy_status=NEW.stage;
 RETURN NEW;
END;
$$;
CREATE FUNCTION preserve_configuration_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
  RAISE EXCEPTION 'configuration identity is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='issue_types' THEN
  IF (NEW.behavior IS DISTINCT FROM OLD.behavior OR NEW.key IS DISTINCT FROM OLD.key)
   AND EXISTS(SELECT 1 FROM issues WHERE type_id=OLD.id) THEN RAISE EXCEPTION 'used type behavior/key is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='priorities' THEN
  IF NEW.key IS DISTINCT FROM OLD.key AND EXISTS(SELECT 1 FROM issues WHERE priority_id=OLD.id) THEN
   RAISE EXCEPTION 'used priority key is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='workflow_stages' THEN
  IF (NEW.workflow_id IS DISTINCT FROM OLD.workflow_id OR NEW.category IS DISTINCT FROM OLD.category OR NEW.legacy_status IS DISTINCT FROM OLD.legacy_status)
   AND EXISTS(SELECT 1 FROM issues WHERE stage_id=OLD.id) THEN RAISE EXCEPTION 'used stage ownership/category is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER projects_configuration_bridge AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION bridge_legacy_project();
CREATE TRIGGER boards_configuration_bridge AFTER INSERT OR UPDATE OF workflow,archived_at ON boards FOR EACH ROW EXECUTE FUNCTION bridge_legacy_board();
CREATE TRIGGER status_configuration_bridge AFTER INSERT OR UPDATE OF stage_name ON project_status_order FOR EACH ROW EXECUTE FUNCTION bridge_legacy_stage();
CREATE TRIGGER rules_configuration_bridge BEFORE INSERT OR UPDATE OF stage,project_id ON project_assignment_rules FOR EACH ROW EXECUTE FUNCTION bridge_legacy_assignment_rule();
CREATE TRIGGER issues_configuration_bridge BEFORE INSERT OR UPDATE OF type,priority,status ON issues FOR EACH ROW EXECUTE FUNCTION bridge_legacy_issue();
CREATE TRIGGER issue_types_identity BEFORE UPDATE ON issue_types FOR EACH ROW EXECUTE FUNCTION preserve_configuration_identity();
CREATE TRIGGER priorities_identity BEFORE UPDATE ON priorities FOR EACH ROW EXECUTE FUNCTION preserve_configuration_identity();
CREATE TRIGGER workflow_stages_identity BEFORE UPDATE ON workflow_stages FOR EACH ROW EXECUTE FUNCTION preserve_configuration_identity();
CREATE TRIGGER workflows_identity BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION preserve_configuration_identity();

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Populated canonical configuration requires forward-compatible rollback; restore the verified backup into a separate database.'; END $$;
-- +goose StatementEnd
