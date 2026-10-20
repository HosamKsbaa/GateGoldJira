-- +goose Up
-- The owner runner completes all guarded expansion batches before this cutover.
-- Physical rows have one owner. Older contracts are projections, not copies.
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM issues WHERE type_id IS NULL OR priority_id IS NULL OR workflow_id IS NULL OR stage_id IS NULL)
 OR EXISTS(SELECT 1 FROM board_columns WHERE legacy_backfill_pending)
 OR EXISTS(SELECT 1 FROM pictures p WHERE NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id AND a.kind='image'))
 OR EXISTS(SELECT 1 FROM attachments p WHERE NOT EXISTS(SELECT 1 FROM asset_attachments a WHERE a.id=p.id AND a.kind='file'))
 OR EXISTS(SELECT 1 FROM comment_version_pictures p WHERE NOT EXISTS(SELECT 1 FROM comment_version_attachments a WHERE (a.comment_id,a.version,a.attachment_id)=(p.comment_id,p.version,p.picture_id))) THEN
  RAISE EXCEPTION 'Canonical backfill must complete before legacy retirement';
 END IF;
END $$;
-- +goose StatementEnd

DROP TRIGGER issues_configuration_bridge ON issues;
DROP TRIGGER issues_modern_bridge ON issues;
DROP TRIGGER issues_registered_stage ON issues;
DROP TRIGGER issues_board_rank_bridge ON issues;
DROP TRIGGER boards_configuration_bridge ON boards;
DROP TRIGGER boards_layout_bridge ON boards;
DROP TRIGGER status_configuration_bridge ON project_status_order;
DROP TRIGGER status_board_order_bridge ON project_status_order;
DROP TRIGGER canonical_asset_compatibility ON asset_attachments;
DROP TRIGGER canonical_reservation_compatibility ON asset_upload_reservations;
DROP FUNCTION bridge_legacy_issue(),bridge_modern_issue(),require_custom_issue_stage(),bridge_legacy_board_rank(),bridge_legacy_board(),bridge_legacy_board_layout(),bridge_legacy_stage(),bridge_legacy_board_order();
DROP FUNCTION backfill_legacy_issue_configuration(integer),backfill_legacy_board_layout(integer),backfill_legacy_board_ranks(integer),sync_legacy_board_layout(uuid),prepare_legacy_board_layout(uuid),sync_legacy_workflow(uuid);
DROP FUNCTION backfill_legacy_assets(integer),backfill_legacy_asset_reservations(integer);
DROP FUNCTION mirror_canonical_asset_compatibility(),mirror_canonical_reservation_compatibility();
DROP FUNCTION mirror_legacy_image_asset(pictures),mirror_legacy_file_asset(attachments),mirror_legacy_image_reservation(upload_reservations),mirror_legacy_file_reservation(attachment_upload_reservations);
DROP TABLE comment_version_pictures,upload_reservations,attachment_upload_reservations,pictures,attachments;
DROP FUNCTION mirror_legacy_image_asset_trigger(),mirror_legacy_file_asset_trigger(),mirror_legacy_image_reservation_trigger(),mirror_legacy_file_reservation_trigger(),mirror_legacy_comment_asset_reference();

ALTER TABLE asset_attachments RENAME TO attachments;
ALTER TABLE asset_upload_reservations RENAME TO upload_reservations;
CREATE VIEW asset_attachments AS SELECT * FROM attachments;
CREATE VIEW asset_upload_reservations AS SELECT * FROM upload_reservations;
ALTER TABLE attachments ALTER COLUMN kind SET DEFAULT 'file',ALTER COLUMN state SET DEFAULT 'published';
-- Existing view dependencies follow the rename. Restate them for schema generators.
CREATE OR REPLACE VIEW compatible_pictures AS SELECT id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel AS in_gallery,uploaded_at,expires_at,published_at FROM attachments WHERE kind='image';
CREATE OR REPLACE VIEW compatible_attachments AS SELECT id,project_id,issue_id,uploaded_by,filename,mime_type,byte_size,checksum,staging_key,staging_generation,coalesce(published_key,'') AS published_key,coalesce(published_generation,0)::bigint AS published_generation,in_panel AS attached,uploaded_at FROM attachments WHERE kind='file' AND state='published';
CREATE VIEW pictures AS SELECT * FROM compatible_pictures;
CREATE VIEW attachment_upload_reservations AS SELECT actor_id,retry_reference,command_hash,asset_id AS attachment_id,project_id,issue_id,staging_key,staging_generation,published_key,published_generation,lease_until,checksum,state,created_at,updated_at FROM upload_reservations WHERE operation='upload_attachment';
CREATE VIEW picture_upload_reservations AS SELECT actor_id,retry_reference,command_hash,asset_id AS picture_id,project_id,issue_id,staging_key,staging_generation,published_key,published_generation,lease_until,checksum,state,created_at,updated_at FROM upload_reservations WHERE operation='upload_picture';
CREATE VIEW comment_version_pictures AS SELECT r.comment_id,r.version,r.issue_id,r.attachment_id AS picture_id FROM comment_version_attachments r JOIN attachments a ON a.id=r.attachment_id WHERE a.kind='image';

-- Keep the exact pre-cutover JSON as immutable archival evidence. It is never
-- used for active layout, transitions, WIP, or ordering and cannot be edited.
ALTER TABLE workflow_stages ADD COLUMN legacy_order_revision bigint NOT NULL DEFAULT 1 CHECK(legacy_order_revision>0);
UPDATE workflow_stages s SET legacy_order_revision=o.revision FROM project_status_order o WHERE o.project_id=s.project_id AND o.status=s.legacy_status;
ALTER TABLE boards ADD COLUMN legacy_snapshot jsonb;
UPDATE boards SET legacy_snapshot=workflow;
ALTER TABLE boards DROP COLUMN workflow,DROP COLUMN in_progress_limit,DROP COLUMN review_limit;
ALTER TABLE boards RENAME TO board_records;
ALTER TABLE issues ADD COLUMN legacy_rank bigint CHECK(legacy_rank>0);
UPDATE issues SET legacy_rank=rank;
ALTER TABLE issues DROP COLUMN status,DROP COLUMN type,DROP COLUMN priority,DROP COLUMN rank;
ALTER TABLE issues RENAME TO issue_records;
-- Replacing status storage also removes indexes containing that column. Retain
-- bounded child-progress and due-reminder lookups against canonical references.
CREATE INDEX issues_parent_page ON issue_records(parent_id,number,id) INCLUDE(stage_id) WHERE parent_id IS NOT NULL;
CREATE INDEX issues_reminder_due_canonical ON issue_records(due_date,id) INCLUDE(stage_id) WHERE due_date IS NOT NULL AND NOT archived;
DROP TABLE project_status_order;

CREATE VIEW issues AS SELECT i.id,i.project_id,i.number,i.title,i.description,i.reporter_id,i.assignee_id,i.due_date,i.parent_id,i.revision,i.created_at,i.updated_at,i.description_format,i.archived,i.backlog,i.backlog_rank,i.type_id,i.priority_id,i.workflow_id,i.stage_id,
 coalesce((SELECT CASE WHEN t.behavior='subtask' THEN 'subtask' WHEN t.key='bug' THEN 'bug' ELSE 'task' END FROM issue_types t WHERE t.id=i.type_id),'task')::text AS type,
 coalesce((SELECT CASE WHEN p.key IN('low','medium','high') THEN p.key ELSE 'medium' END FROM priorities p WHERE p.id=i.priority_id),'medium')::text AS priority,
 coalesce((SELECT s.legacy_status FROM workflow_stages s WHERE s.id=i.stage_id),'todo')::text AS status,
 coalesce((SELECT r.rank FROM board_issue_ranks r JOIN board_records b ON b.id=r.board_id WHERE r.issue_id=i.id AND b.project_id=i.project_id AND b.is_default),i.legacy_rank,1024)::bigint AS rank
FROM issue_records i;

CREATE VIEW project_status_order AS SELECT s.project_id,s.legacy_status AS status,
 s.legacy_order_revision AS revision,
 s.name AS stage_name,s.retired
FROM workflow_stages s;

CREATE VIEW boards AS SELECT b.id,b.project_id,b.name,b.name_key,b.created_by,b.is_default,b.saved_filters,b.filters_version,
 (SELECT c.wip_limit FROM board_columns c WHERE c.board_id=b.id AND c.legacy_status='in_progress')::integer AS in_progress_limit,
 (SELECT c.wip_limit FROM board_columns c WHERE c.board_id=b.id AND c.legacy_status='review')::integer AS review_limit,
 b.revision,b.archived_at,b.created_at,b.updated_at,
 coalesce((SELECT jsonb_build_object('columns',jsonb_agg(jsonb_strip_nulls(jsonb_build_object('status',s.legacy_status,'name',c.name,'warningLimit',c.wip_limit,
  'allowedTargets',coalesce((SELECT jsonb_agg(target.legacy_status ORDER BY target.position,target.id) FROM workflow_transitions e JOIN workflow_stages target ON target.id=e.to_stage_id WHERE e.from_stage_id=s.id AND NOT e.retired),'[]'::jsonb))) ORDER BY c.position,s.position,s.id))
 FROM board_columns c JOIN board_column_stages m ON m.column_id=c.id JOIN workflow_stages s ON s.id=m.stage_id WHERE c.board_id=b.id),'{"columns":[]}'::jsonb)::jsonb AS workflow
FROM board_records b;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION bridge_legacy_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM seed_legacy_configuration(NEW.id);
 INSERT INTO workflow_transitions(id,project_id,workflow_id,from_stage_id,to_stage_id)
 SELECT gen_random_uuid(),NEW.id,s.workflow_id,s.id,t.id FROM workflow_stages s JOIN workflow_stages t ON t.project_id=s.project_id AND t.workflow_id=s.workflow_id AND t.id<>s.id
 WHERE s.project_id=NEW.id AND s.legacy_status IN('todo','in_progress','review','done') AND t.legacy_status IN('todo','in_progress','review','done')
 ON CONFLICT(workflow_id,from_stage_id,to_stage_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE FUNCTION insert_picture_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO attachments(id,project_id,issue_id,uploaded_by,kind,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,uploaded_at,expires_at,published_at)
 VALUES(NEW.id,NEW.project_id,NEW.issue_id,NEW.uploaded_by,'image',NEW.filename,NEW.description,NEW.mime_type,NEW.byte_size,NEW.checksum,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.state,coalesce(NEW.in_gallery,false),coalesce(NEW.uploaded_at,now()),NEW.expires_at,NEW.published_at);
 RETURN NEW;
END $$;
CREATE FUNCTION check_canonical_issue_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE behavior text;parent_behavior text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.legacy_rank IS DISTINCT FROM OLD.legacy_rank THEN RAISE EXCEPTION 'Migration order evidence is immutable' USING ERRCODE='23514';END IF;
 SELECT t.behavior INTO STRICT behavior FROM issue_types t WHERE t.project_id=NEW.project_id AND t.id=NEW.type_id;
 IF (behavior='subtask') IS DISTINCT FROM (NEW.parent_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Subtask behavior requires a parent; standard issues cannot have one' USING ERRCODE='23514';
 END IF;
 IF NEW.parent_id IS NOT NULL THEN
  SELECT t.behavior INTO parent_behavior FROM issue_records p JOIN issue_types t ON t.id=p.type_id WHERE p.project_id=NEW.project_id AND p.id=NEW.parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent must belong to this project' USING ERRCODE='23503';END IF;
  IF parent_behavior='subtask' THEN RAISE EXCEPTION 'Subtasks cannot have subtasks' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.type_id IS DISTINCT FROM OLD.type_id AND behavior='subtask' AND EXISTS(SELECT 1 FROM issue_records c WHERE c.parent_id=NEW.id) THEN
  RAISE EXCEPTION 'An issue with children cannot become a subtask' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION write_issue_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode text; legacy boolean;flow uuid;
BEGIN
 SELECT core_mode INTO STRICT mode FROM projects WHERE id=NEW.project_id;
 legacy=mode='legacy';
 IF legacy THEN PERFORM ensure_legacy_default_board(NEW.project_id);END IF;
 IF TG_OP='INSERT' THEN
  NEW.type=coalesce(NEW.type,CASE WHEN NEW.parent_id IS NULL THEN 'task' ELSE 'subtask' END);
  NEW.priority=coalesce(NEW.priority,'medium');NEW.status=coalesce(NEW.status,'todo');
  IF NEW.type_id IS NULL THEN SELECT id INTO STRICT NEW.type_id FROM issue_types WHERE project_id=NEW.project_id AND key=NEW.type;END IF;
  IF NEW.priority_id IS NULL THEN SELECT id INTO STRICT NEW.priority_id FROM priorities WHERE project_id=NEW.project_id AND key=NEW.priority;END IF;
  IF NEW.workflow_id IS NULL THEN SELECT workflow_id INTO STRICT NEW.workflow_id FROM issue_type_workflows WHERE project_id=NEW.project_id AND type_id=NEW.type_id AND is_default;END IF;
  IF NEW.stage_id IS NULL THEN SELECT id INTO STRICT NEW.stage_id FROM workflow_stages WHERE project_id=NEW.project_id AND workflow_id=NEW.workflow_id AND legacy_status=NEW.status;END IF;
  INSERT INTO issue_records(id,project_id,number,title,description,description_format,reporter_id,assignee_id,due_date,parent_id,revision,created_at,updated_at,archived,backlog,backlog_rank,type_id,priority_id,workflow_id,stage_id)
  VALUES(NEW.id,NEW.project_id,NEW.number,NEW.title,coalesce(NEW.description,''),coalesce(NEW.description_format,'plain'),NEW.reporter_id,NEW.assignee_id,NEW.due_date,NEW.parent_id,coalesce(NEW.revision,1),coalesce(NEW.created_at,now()),coalesce(NEW.updated_at,now()),coalesce(NEW.archived,false),coalesce(NEW.backlog,false),coalesce(NEW.backlog_rank,1024),NEW.type_id,NEW.priority_id,NEW.workflow_id,NEW.stage_id);
 ELSE
  IF NEW.type IS DISTINCT FROM OLD.type AND NEW.type_id IS NOT DISTINCT FROM OLD.type_id THEN
   IF NOT legacy THEN RAISE EXCEPTION 'Use canonical issue choices' USING ERRCODE='23514';END IF;
   SELECT id INTO STRICT NEW.type_id FROM issue_types WHERE project_id=NEW.project_id AND key=NEW.type;
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority AND NEW.priority_id IS NOT DISTINCT FROM OLD.priority_id THEN
   IF NOT legacy THEN RAISE EXCEPTION 'Use canonical priority choices' USING ERRCODE='23514';END IF;
   SELECT id INTO STRICT NEW.priority_id FROM priorities WHERE project_id=NEW.project_id AND key=NEW.priority;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
   IF NOT legacy THEN RAISE EXCEPTION 'Use canonical workflow stages' USING ERRCODE='23514';END IF;
   SELECT id,workflow_id INTO STRICT NEW.stage_id,NEW.workflow_id FROM workflow_stages WHERE project_id=NEW.project_id AND legacy_status=NEW.status;
  END IF;
  UPDATE issue_records SET id=NEW.id,project_id=NEW.project_id,number=NEW.number,title=NEW.title,description=NEW.description,description_format=NEW.description_format,
  reporter_id=NEW.reporter_id,assignee_id=NEW.assignee_id,due_date=NEW.due_date,parent_id=NEW.parent_id,revision=NEW.revision,created_at=NEW.created_at,updated_at=NEW.updated_at,
  archived=NEW.archived,backlog=NEW.backlog,backlog_rank=NEW.backlog_rank,type_id=NEW.type_id,priority_id=NEW.priority_id,workflow_id=NEW.workflow_id,stage_id=NEW.stage_id WHERE id=OLD.id;
 END IF;
 IF legacy AND (TG_OP='INSERT' OR NEW.rank IS DISTINCT FROM OLD.rank OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
  INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank)
  SELECT NEW.project_id,m.board_id,m.column_id,NEW.id,coalesce(NEW.rank,1024) FROM board_column_stages m WHERE m.project_id=NEW.project_id AND m.stage_id=NEW.stage_id
  ON CONFLICT(board_id,issue_id) DO UPDATE SET column_id=EXCLUDED.column_id,rank=EXCLUDED.rank;
 END IF;
 SELECT * INTO NEW FROM issues WHERE id=NEW.id;RETURN NEW;
END $$;
CREATE FUNCTION write_legacy_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stage uuid;flow uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT id INTO stage FROM workflow_stages WHERE project_id=NEW.project_id AND legacy_status=NEW.status;
  IF stage IS NULL THEN
   SELECT id INTO STRICT flow FROM workflows WHERE project_id=NEW.project_id AND legacy_default;
   INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position)
   VALUES(gen_random_uuid(),NEW.project_id,flow,coalesce(nullif(NEW.stage_name,''),NEW.status),split_part(NEW.status,':',1),NEW.status,coalesce((SELECT max(position)+1 FROM workflow_stages WHERE workflow_id=flow),1)) RETURNING id INTO stage;
  END IF;
 ELSE
  SELECT id INTO STRICT stage FROM workflow_stages WHERE project_id=OLD.project_id AND legacy_status=OLD.status;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Stage identity is immutable' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.stage_name IS NOT NULL AND NEW.stage_name<>'' THEN UPDATE workflow_stages SET name=NEW.stage_name WHERE id=stage;END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.retired IS DISTINCT FROM OLD.retired THEN UPDATE workflow_stages SET retired=NEW.retired,accepts_entries=NOT NEW.retired WHERE id=stage;END IF;
  IF NEW.revision IS DISTINCT FROM OLD.revision THEN
   UPDATE workflow_stages SET legacy_order_revision=NEW.revision WHERE id=stage;
   IF EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='legacy') THEN UPDATE board_columns c SET order_revision=NEW.revision WHERE EXISTS(SELECT 1 FROM board_column_stages m WHERE m.column_id=c.id AND m.stage_id=stage);END IF;
  END IF;
 END IF;
 SELECT * INTO NEW FROM project_status_order WHERE project_id=NEW.project_id AND status=NEW.status;RETURN NEW;
END $$;

CREATE FUNCTION configure_legacy_board(p_board uuid,p_workflow jsonb,p_progress integer,p_review integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b board_records%ROWTYPE;flow uuid;item record;stage uuid;col uuid;lim integer;ord bigint;
BEGIN
 SELECT * INTO STRICT b FROM board_records WHERE id=p_board;
 SELECT id INTO STRICT flow FROM workflows WHERE project_id=b.project_id AND legacy_default;
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=b.project_id AND core_mode='legacy') THEN RETURN;END IF;
 FOR item IN SELECT value,ordinality FROM jsonb_array_elements(p_workflow->'columns') WITH ORDINALITY LOOP
  SELECT id INTO stage FROM workflow_stages WHERE project_id=b.project_id AND legacy_status=item.value->>'status';
  IF stage IS NULL THEN
   INSERT INTO workflow_stages(id,project_id,workflow_id,name,category,legacy_status,position)
   VALUES(gen_random_uuid(),b.project_id,flow,item.value->>'name',split_part(item.value->>'status',':',1),item.value->>'status',1000+item.ordinality) RETURNING id INTO stage;
  END IF;
  SELECT coalesce(max(order_revision),1) INTO ord FROM board_columns WHERE project_id=b.project_id AND legacy_status=item.value->>'status';
  lim=CASE WHEN item.value->>'warningLimit' IS NOT NULL THEN nullif((item.value->>'warningLimit')::integer,0) WHEN item.value->>'status'='in_progress' THEN p_progress WHEN item.value->>'status'='review' THEN p_review END;
  INSERT INTO board_columns(id,project_id,board_id,name,position,wip_limit,wip_mode,order_revision,legacy_status)
  VALUES(gen_random_uuid(),b.project_id,b.id,item.value->>'name',item.ordinality,lim,'warn',ord,item.value->>'status')
  ON CONFLICT(board_id,legacy_status) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,wip_limit=EXCLUDED.wip_limit,wip_mode='warn' RETURNING id INTO col;
  INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) VALUES(b.project_id,b.id,col,stage) ON CONFLICT(board_id,stage_id) DO UPDATE SET column_id=EXCLUDED.column_id;
 END LOOP;
 DELETE FROM board_columns c WHERE c.board_id=b.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_workflow->'columns') v WHERE v->>'status'=c.legacy_status);
 IF b.archived_at IS NULL THEN
  UPDATE workflow_stages s SET retired=NOT s.is_initial AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_workflow->'columns') v WHERE v->>'status'=s.legacy_status),
   accepts_entries=s.is_initial OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_workflow->'columns') v WHERE v->>'status'=s.legacy_status) WHERE s.workflow_id=flow;
  UPDATE workflow_transitions SET retired=true WHERE workflow_id=flow;
  INSERT INTO workflow_transitions(id,project_id,workflow_id,from_stage_id,to_stage_id)
  SELECT gen_random_uuid(),b.project_id,flow,source.id,target.id FROM jsonb_array_elements(p_workflow->'columns') c
  JOIN workflow_stages source ON source.project_id=b.project_id AND source.legacy_status=c->>'status'
  CROSS JOIN LATERAL jsonb_array_elements_text(c->'allowedTargets') dest
  JOIN workflow_stages target ON target.project_id=b.project_id AND target.workflow_id=flow AND target.legacy_status=dest.value
  ON CONFLICT(workflow_id,from_stage_id,to_stage_id) DO UPDATE SET retired=false;
 END IF;
END $$;
CREATE FUNCTION ensure_legacy_default_board(p_project uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE board uuid;template jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM board_records WHERE project_id=p_project AND is_default) THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:default-board:'||p_project::text,0));
 INSERT INTO board_records(id,project_id,name,name_key,created_by,is_default)
 SELECT gen_random_uuid(),id,'All Issues','all issues',created_by,true FROM projects WHERE id=p_project
 ON CONFLICT DO NOTHING RETURNING id INTO board;
 IF board IS NULL THEN RETURN;END IF;
 SELECT jsonb_build_object('columns',jsonb_agg(jsonb_build_object('status',s.legacy_status,'name',s.name,'allowedTargets',coalesce((SELECT jsonb_agg(t.legacy_status ORDER BY t.position,t.id) FROM workflow_transitions e JOIN workflow_stages t ON t.id=e.to_stage_id WHERE e.from_stage_id=s.id AND NOT e.retired),'[]'::jsonb)) ORDER BY s.position,s.id)) INTO template FROM workflow_stages s JOIN workflows w ON w.id=s.workflow_id WHERE s.project_id=p_project AND w.legacy_default AND NOT s.retired;
 PERFORM configure_legacy_board(board,template,NULL,NULL);
 INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank)
 SELECT i.project_id,board,m.column_id,i.id,coalesce(i.legacy_rank,1024) FROM issue_records i JOIN board_column_stages m ON m.board_id=board AND m.stage_id=i.stage_id WHERE i.project_id=p_project;
END $$;
CREATE FUNCTION write_board_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template jsonb;progress integer;review integer;
BEGIN
 IF (NEW.in_progress_limit IS NOT NULL AND NEW.in_progress_limit NOT BETWEEN 1 AND 1000) OR (NEW.review_limit IS NOT NULL AND NEW.review_limit NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'WIP limit must be 1-1000' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO board_records(id,project_id,name,name_key,created_by,is_default,saved_filters,filters_version,revision,archived_at,created_at,updated_at)
  VALUES(NEW.id,NEW.project_id,NEW.name,NEW.name_key,NEW.created_by,coalesce(NEW.is_default,false),coalesce(NEW.saved_filters,'{}'::jsonb),coalesce(NEW.filters_version,1),coalesce(NEW.revision,1),NEW.archived_at,coalesce(NEW.created_at,now()),coalesce(NEW.updated_at,now()));
  template=NEW.workflow;
  IF template IS NULL THEN
   SELECT jsonb_build_object('columns',jsonb_agg(jsonb_build_object('status',s.legacy_status,'name',s.name,'allowedTargets',coalesce((SELECT jsonb_agg(t.legacy_status ORDER BY t.position,t.id) FROM workflow_transitions e JOIN workflow_stages t ON t.id=e.to_stage_id WHERE e.from_stage_id=s.id AND NOT e.retired),'[]'::jsonb)) ORDER BY s.position,s.id)) INTO template FROM workflow_stages s JOIN workflows w ON w.id=s.workflow_id WHERE s.project_id=NEW.project_id AND w.legacy_default AND NOT s.retired;
  END IF;
  PERFORM configure_legacy_board(NEW.id,template,NEW.in_progress_limit,NEW.review_limit);
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.is_default IS DISTINCT FROM OLD.is_default THEN RAISE EXCEPTION 'Board identity is immutable' USING ERRCODE='23514';END IF;
  UPDATE board_records SET name=NEW.name,name_key=NEW.name_key,saved_filters=NEW.saved_filters,filters_version=NEW.filters_version,revision=NEW.revision,archived_at=NEW.archived_at,updated_at=NEW.updated_at WHERE id=OLD.id;
  IF (NEW.workflow,NEW.in_progress_limit,NEW.review_limit) IS DISTINCT FROM (OLD.workflow,OLD.in_progress_limit,OLD.review_limit) THEN
   PERFORM configure_legacy_board(NEW.id,NEW.workflow,NEW.in_progress_limit,NEW.review_limit);
  END IF;
 END IF;
 SELECT * INTO NEW FROM boards WHERE id=NEW.id;RETURN NEW;
END $$;
CREATE FUNCTION preserve_legacy_board_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.legacy_snapshot IS DISTINCT FROM OLD.legacy_snapshot THEN RAISE EXCEPTION 'Migration evidence is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
-- +goose StatementEnd
CREATE TRIGGER pictures_contract_insert INSTEAD OF INSERT ON pictures FOR EACH ROW EXECUTE FUNCTION insert_picture_contract();
CREATE TRIGGER issues_canonical_shape BEFORE INSERT OR UPDATE OF type_id,parent_id,legacy_rank ON issue_records FOR EACH ROW EXECUTE FUNCTION check_canonical_issue_shape();
CREATE TRIGGER issues_contract_write INSTEAD OF INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION write_issue_contract();
CREATE TRIGGER status_contract_write INSTEAD OF INSERT OR UPDATE ON project_status_order FOR EACH ROW EXECUTE FUNCTION write_legacy_order();
CREATE TRIGGER boards_contract_write INSTEAD OF INSERT OR UPDATE ON boards FOR EACH ROW EXECUTE FUNCTION write_board_contract();
CREATE TRIGGER boards_snapshot_immutable BEFORE UPDATE ON board_records FOR EACH ROW EXECUTE FUNCTION preserve_legacy_board_snapshot();

DROP TRIGGER rules_configuration_bridge ON project_assignment_rules;
DROP FUNCTION bridge_legacy_assignment_rule();
ALTER TABLE project_assignment_rules ADD CONSTRAINT assignment_canonical_required CHECK(stage_id IS NOT NULL);
ALTER TABLE project_assignment_rules DROP COLUMN stage;
ALTER TABLE project_assignment_rules RENAME TO assignment_rule_records;
CREATE UNIQUE INDEX assignment_rule_stage ON assignment_rule_records(project_id,stage_id) WHERE enabled;
CREATE VIEW project_assignment_rules AS SELECT r.*,coalesce((SELECT legacy_status FROM workflow_stages s WHERE s.id=r.stage_id),'todo')::text AS stage FROM assignment_rule_records r;
-- +goose StatementBegin
CREATE FUNCTION write_assignment_rule_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
  SELECT id INTO NEW.stage_id FROM workflow_stages WHERE project_id=NEW.project_id AND legacy_status=NEW.stage;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment stage must belong to the project' USING ERRCODE='23503';END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO assignment_rule_records(id,project_id,name,stage_id,assignee_id,enabled,revision,created_by,created_at,updated_at)
  VALUES(NEW.id,NEW.project_id,NEW.name,NEW.stage_id,NEW.assignee_id,coalesce(NEW.enabled,true),coalesce(NEW.revision,1),NEW.created_by,coalesce(NEW.created_at,now()),coalesce(NEW.updated_at,now()));
 ELSE
  IF (NEW.id,NEW.project_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Assignment rule identity is immutable' USING ERRCODE='23514';END IF;
  UPDATE assignment_rule_records SET name=NEW.name,stage_id=NEW.stage_id,assignee_id=NEW.assignee_id,enabled=NEW.enabled,revision=NEW.revision,updated_at=NEW.updated_at WHERE id=OLD.id;
 END IF;
 RETURN NEW;
END $$;
-- +goose StatementEnd
CREATE TRIGGER rules_contract_write INSTEAD OF INSERT OR UPDATE ON project_assignment_rules FOR EACH ROW EXECUTE FUNCTION write_assignment_rule_contract();

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Storage retirement requires a verified forward repair or isolated restore';END $$;
-- +goose StatementEnd
