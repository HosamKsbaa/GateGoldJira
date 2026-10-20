-- +goose Up
-- Keep old projections until all consumers retire them. Canonical references
-- own modern issue semantics; old contracts cannot silently retarget a choice.
ALTER TABLE workflow_stages ADD CONSTRAINT workflow_stage_category_token CHECK(category=split_part(legacy_status,':',1));
ALTER TABLE issues ADD CONSTRAINT issues_canonical_required CHECK(type_id IS NOT NULL AND priority_id IS NOT NULL AND workflow_id IS NOT NULL AND stage_id IS NOT NULL) NOT VALID;

-- +goose StatementBegin
CREATE FUNCTION bridge_modern_issue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE type_key text; type_behavior text; priority_key text; stage_token text;
 expected_type text; expected_priority text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.project_id,NEW.type_id,NEW.priority_id,NEW.workflow_id,NEW.stage_id,NEW.type,NEW.priority,NEW.status)
   IS NOT DISTINCT FROM (OLD.project_id,OLD.type_id,OLD.priority_id,OLD.workflow_id,OLD.stage_id,OLD.type,OLD.priority,OLD.status) THEN
   RETURN NEW;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='modern') THEN RETURN NEW; END IF;
 SELECT t.key,t.behavior,p.key,s.legacy_status INTO type_key,type_behavior,priority_key,stage_token
 FROM issue_types t,priorities p,workflow_stages s
 WHERE t.project_id=NEW.project_id AND t.id=NEW.type_id
 AND p.project_id=NEW.project_id AND p.id=NEW.priority_id
 AND s.project_id=NEW.project_id AND s.workflow_id=NEW.workflow_id AND s.id=NEW.stage_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'modern issue writes require scoped canonical references' USING ERRCODE='23514'; END IF;
 expected_type=CASE WHEN type_behavior='subtask' THEN 'subtask' WHEN type_key='bug' THEN 'bug' ELSE 'task' END;
 expected_priority=CASE WHEN priority_key IN('low','medium','high') THEN priority_key ELSE 'medium' END;
 IF TG_OP='UPDATE' THEN
  IF (NEW.type_id,NEW.priority_id,NEW.workflow_id,NEW.stage_id) IS NOT DISTINCT FROM (OLD.type_id,OLD.priority_id,OLD.workflow_id,OLD.stage_id)
   AND (NEW.type,NEW.priority,NEW.status) IS DISTINCT FROM (expected_type,expected_priority,stage_token) THEN
   RAISE EXCEPTION 'modern issue choices must be changed through canonical identifiers' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.type=expected_type;NEW.priority=expected_priority;NEW.status=stage_token;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER issues_modern_bridge BEFORE INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION bridge_modern_issue();

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Canonical issue semantics require a verified forward repair or restore into a separate database'; END $$;
-- +goose StatementEnd
