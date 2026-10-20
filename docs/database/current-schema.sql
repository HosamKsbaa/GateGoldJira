--
-- PostgreSQL database dump
--

\restrict JTGvIhMI93QuIDhqOhmeQLjScHssPfZvOVNMmLZygp4FM6wWqoMxdzzeaw2DddA

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: advance_native_board_stage_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advance_native_board_stage_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='modern') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW;END IF;
  UPDATE board_columns c SET order_revision=c.order_revision+1 WHERE c.project_id=NEW.project_id
   AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=c.id AND (mapping.stage_id=OLD.stage_id OR mapping.stage_id=NEW.stage_id));
 ELSE
  UPDATE board_columns c SET order_revision=c.order_revision+1 WHERE c.project_id=NEW.project_id
   AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=c.id AND mapping.stage_id=NEW.stage_id);
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: bridge_legacy_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bridge_legacy_project() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 PERFORM seed_legacy_configuration(NEW.id);
 INSERT INTO workflow_transitions(id,project_id,workflow_id,from_stage_id,to_stage_id)
 SELECT gen_random_uuid(),NEW.id,s.workflow_id,s.id,t.id FROM workflow_stages s JOIN workflow_stages t ON t.project_id=s.project_id AND t.workflow_id=s.workflow_id AND t.id<>s.id
 WHERE s.project_id=NEW.id AND s.legacy_status IN('todo','in_progress','review','done') AND t.legacy_status IN('todo','in_progress','review','done')
 ON CONFLICT(workflow_id,from_stage_id,to_stage_id) DO NOTHING;
 RETURN NEW;
END $$;


--
-- Name: check_canonical_issue_shape(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_canonical_issue_shape() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: configure_legacy_board(uuid, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.configure_legacy_board(p_board uuid, p_workflow jsonb, p_progress integer, p_review integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: ensure_legacy_default_board(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_legacy_default_board(p_project uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: immutable_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only' USING ERRCODE = '23514';
END;
$$;


--
-- Name: insert_picture_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_picture_contract() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 INSERT INTO attachments(id,project_id,issue_id,uploaded_by,kind,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,uploaded_at,expires_at,published_at)
 VALUES(NEW.id,NEW.project_id,NEW.issue_id,NEW.uploaded_by,'image',NEW.filename,NEW.description,NEW.mime_type,NEW.byte_size,NEW.checksum,NEW.staging_key,NEW.staging_generation,NEW.published_key,NEW.published_generation,NEW.state,coalesce(NEW.in_gallery,false),coalesce(NEW.uploaded_at,now()),NEW.expires_at,NEW.published_at);
 RETURN NEW;
END $$;


--
-- Name: preserve_approval_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_approval_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'approval decisions are retained; resubmit instead' USING ERRCODE='23514';END;
$$;


--
-- Name: preserve_asset_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_asset_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','in_panel','published_key','published_generation','published_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','in_panel','published_key','published_generation','published_at'])
 OR (OLD.published_key IS NOT NULL AND (NEW.published_key,NEW.published_generation,NEW.published_at) IS DISTINCT FROM (OLD.published_key,OLD.published_generation,OLD.published_at)) THEN
  RAISE EXCEPTION 'asset bytes and attribution are immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END $$;


--
-- Name: preserve_asset_session_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_asset_session_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (NEW.actor_id,NEW.retry_reference,NEW.operation,NEW.command_hash,NEW.asset_id,NEW.project_id,NEW.issue_id,NEW.kind,NEW.staging_key,NEW.maximum_bytes,NEW.upload_method,NEW.upload_expires_at,NEW.created_at)
 IS DISTINCT FROM (OLD.actor_id,OLD.retry_reference,OLD.operation,OLD.command_hash,OLD.asset_id,OLD.project_id,OLD.issue_id,OLD.kind,OLD.staging_key,OLD.maximum_bytes,OLD.upload_method,OLD.upload_expires_at,OLD.created_at)
 OR (OLD.expected_bytes IS NOT NULL AND (NEW.expected_bytes,NEW.filename,NEW.description,NEW.mime_type,NEW.publication) IS DISTINCT FROM (OLD.expected_bytes,OLD.filename,OLD.description,OLD.mime_type,OLD.publication)) THEN
  RAISE EXCEPTION 'upload identity and declared content are immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END $$;


--
-- Name: preserve_attachment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_attachment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (to_jsonb(NEW)-'attached') IS DISTINCT FROM (to_jsonb(OLD)-'attached') THEN
  RAISE EXCEPTION 'attachment bytes and attribution are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: preserve_board_column_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_board_column_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.board_id IS DISTINCT FROM OLD.board_id THEN
  RAISE EXCEPTION 'board column ownership is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: preserve_comment_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_comment_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'comment attribution is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: preserve_configuration_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_configuration_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: preserve_field_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_field_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: preserve_field_option_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_field_option_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.field_id IS DISTINCT FROM OLD.field_id OR NEW.value_kind IS DISTINCT FROM OLD.value_kind THEN
  RAISE EXCEPTION 'field option ownership is immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END;
$$;


--
-- Name: preserve_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: preserve_issue_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_issue_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.number IS DISTINCT FROM OLD.number OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'issue attribution and relationship are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: preserve_legacy_board_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_legacy_board_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN IF NEW.legacy_snapshot IS DISTINCT FROM OLD.legacy_snapshot THEN RAISE EXCEPTION 'Migration evidence is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;


--
-- Name: preserve_published_picture(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_published_picture() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.state = 'published' AND (to_jsonb(NEW) - 'in_gallery') IS DISTINCT FROM (to_jsonb(OLD) - 'in_gallery') THEN
    RAISE EXCEPTION 'published picture is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: seed_legacy_configuration(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_legacy_configuration(p_project uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: write_assignment_rule_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_assignment_rule_contract() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: write_board_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_board_contract() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: write_issue_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_issue_contract() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: write_legacy_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.write_legacy_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_events (
    id uuid NOT NULL,
    actor_id uuid NOT NULL,
    channel text NOT NULL,
    action text NOT NULL,
    resource_kind text NOT NULL,
    resource_id uuid NOT NULL,
    project_id uuid,
    issue_id uuid,
    changes jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_events_action_check CHECK (((char_length(action) >= 1) AND (char_length(action) <= 100))),
    CONSTRAINT activity_events_changes_check CHECK ((jsonb_typeof(changes) = 'object'::text)),
    CONSTRAINT activity_events_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'mcp'::text]))),
    CONSTRAINT activity_events_check CHECK (((issue_id IS NULL) OR (project_id IS NOT NULL))),
    CONSTRAINT activity_events_resource_kind_check CHECK (((char_length(resource_kind) >= 1) AND (char_length(resource_kind) <= 50)))
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid CONSTRAINT asset_attachments_id_not_null NOT NULL,
    project_id uuid CONSTRAINT asset_attachments_project_id_not_null NOT NULL,
    issue_id uuid CONSTRAINT asset_attachments_issue_id_not_null NOT NULL,
    uploaded_by uuid CONSTRAINT asset_attachments_uploaded_by_not_null NOT NULL,
    kind text DEFAULT 'file'::text CONSTRAINT asset_attachments_kind_not_null NOT NULL,
    filename text CONSTRAINT asset_attachments_filename_not_null NOT NULL,
    description text DEFAULT ''::text CONSTRAINT asset_attachments_description_not_null NOT NULL,
    mime_type text CONSTRAINT asset_attachments_mime_type_not_null NOT NULL,
    byte_size bigint CONSTRAINT asset_attachments_byte_size_not_null NOT NULL,
    checksum text CONSTRAINT asset_attachments_checksum_not_null NOT NULL,
    staging_key text CONSTRAINT asset_attachments_staging_key_not_null NOT NULL,
    staging_generation bigint CONSTRAINT asset_attachments_staging_generation_not_null NOT NULL,
    published_key text,
    published_generation bigint,
    state text DEFAULT 'published'::text CONSTRAINT asset_attachments_state_not_null NOT NULL,
    in_panel boolean DEFAULT false CONSTRAINT asset_attachments_in_panel_not_null NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() CONSTRAINT asset_attachments_uploaded_at_not_null NOT NULL,
    expires_at timestamp with time zone,
    published_at timestamp with time zone,
    CONSTRAINT asset_attachments_byte_size_check CHECK (((byte_size >= 1) AND (byte_size <= 104857600))),
    CONSTRAINT asset_attachments_check CHECK ((((kind = 'image'::text) AND (mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text])) AND (byte_size <= 10485760) AND (char_length(description) > 0)) OR ((kind = 'file'::text) AND (mime_type = ANY (ARRAY['application/octet-stream'::text, 'application/pdf'::text, 'text/plain'::text, 'text/csv'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::text]))))),
    CONSTRAINT asset_attachments_check1 CHECK (((published_key IS NULL) = (published_generation IS NULL))),
    CONSTRAINT asset_attachments_check2 CHECK (((state <> 'published'::text) OR (published_key IS NOT NULL))),
    CONSTRAINT asset_attachments_check3 CHECK (((state <> 'draft'::text) OR ((expires_at IS NOT NULL) AND (published_key IS NULL)))),
    CONSTRAINT asset_attachments_check4 CHECK (((NOT in_panel) OR (state = 'published'::text))),
    CONSTRAINT asset_attachments_checksum_check CHECK ((checksum ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT asset_attachments_description_check CHECK ((char_length(description) <= 200)),
    CONSTRAINT asset_attachments_filename_check CHECK (((char_length(filename) >= 1) AND (char_length(filename) <= 255))),
    CONSTRAINT asset_attachments_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'file'::text]))),
    CONSTRAINT asset_attachments_published_generation_check CHECK ((published_generation > 0)),
    CONSTRAINT asset_attachments_staging_generation_check CHECK ((staging_generation > 0)),
    CONSTRAINT asset_attachments_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text, 'expired'::text])))
);


--
-- Name: asset_attachments; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.asset_attachments AS
 SELECT id,
    project_id,
    issue_id,
    uploaded_by,
    kind,
    filename,
    description,
    mime_type,
    byte_size,
    checksum,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    state,
    in_panel,
    uploaded_at,
    expires_at,
    published_at
   FROM public.attachments;


--
-- Name: upload_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_reservations (
    actor_id uuid CONSTRAINT asset_upload_reservations_actor_id_not_null NOT NULL,
    retry_reference uuid CONSTRAINT asset_upload_reservations_retry_reference_not_null NOT NULL,
    operation text CONSTRAINT asset_upload_reservations_operation_not_null NOT NULL,
    command_hash text CONSTRAINT asset_upload_reservations_command_hash_not_null NOT NULL,
    asset_id uuid CONSTRAINT asset_upload_reservations_asset_id_not_null NOT NULL,
    project_id uuid CONSTRAINT asset_upload_reservations_project_id_not_null NOT NULL,
    issue_id uuid CONSTRAINT asset_upload_reservations_issue_id_not_null NOT NULL,
    kind text CONSTRAINT asset_upload_reservations_kind_not_null NOT NULL,
    staging_key text CONSTRAINT asset_upload_reservations_staging_key_not_null NOT NULL,
    staging_generation bigint,
    published_key text,
    published_generation bigint,
    checksum text,
    lease_until timestamp with time zone CONSTRAINT asset_upload_reservations_lease_until_not_null NOT NULL,
    state text CONSTRAINT asset_upload_reservations_state_not_null NOT NULL,
    expected_bytes bigint,
    maximum_bytes bigint CONSTRAINT asset_upload_reservations_maximum_bytes_not_null NOT NULL,
    upload_method text DEFAULT 'backend'::text CONSTRAINT asset_upload_reservations_upload_method_not_null NOT NULL,
    upload_expires_at timestamp with time zone CONSTRAINT asset_upload_reservations_upload_expires_at_not_null NOT NULL,
    storage_session text,
    received_bytes bigint DEFAULT 0 CONSTRAINT asset_upload_reservations_received_bytes_not_null NOT NULL,
    filename text,
    description text,
    mime_type text,
    publication text,
    last_chunk_hash text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT asset_upload_reservations_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT asset_upload_reservations_updated_at_not_null NOT NULL,
    CONSTRAINT asset_upload_reservations_check CHECK (((expected_bytes IS NULL) OR (expected_bytes <= maximum_bytes))),
    CONSTRAINT asset_upload_reservations_check1 CHECK (((expected_bytes IS NULL) OR (received_bytes <= expected_bytes))),
    CONSTRAINT asset_upload_reservations_check2 CHECK (((kind <> 'image'::text) OR (maximum_bytes <= 10485760))),
    CONSTRAINT asset_upload_reservations_check3 CHECK (((operation = ANY (ARRAY['upload_picture'::text, 'upload_attachment'::text])) OR ((expected_bytes IS NOT NULL) AND (filename IS NOT NULL) AND (mime_type IS NOT NULL) AND (publication IS NOT NULL)))),
    CONSTRAINT asset_upload_reservations_check4 CHECK (((upload_method = 'backend'::text) OR (expected_bytes IS NOT NULL))),
    CONSTRAINT asset_upload_reservations_check5 CHECK (((state <> ALL (ARRAY['ready'::text, 'committed'::text])) OR ((staging_generation IS NOT NULL) AND (checksum IS NOT NULL)))),
    CONSTRAINT asset_upload_reservations_check6 CHECK (((published_key IS NULL) = (published_generation IS NULL))),
    CONSTRAINT asset_upload_reservations_checksum_check CHECK ((checksum ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT asset_upload_reservations_command_hash_check CHECK ((command_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT asset_upload_reservations_description_check CHECK ((char_length(description) <= 200)),
    CONSTRAINT asset_upload_reservations_expected_bytes_check CHECK ((expected_bytes > 0)),
    CONSTRAINT asset_upload_reservations_filename_check CHECK (((char_length(filename) >= 1) AND (char_length(filename) <= 255))),
    CONSTRAINT asset_upload_reservations_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'file'::text]))),
    CONSTRAINT asset_upload_reservations_last_chunk_hash_check CHECK ((last_chunk_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT asset_upload_reservations_maximum_bytes_check CHECK (((maximum_bytes >= 1) AND (maximum_bytes <= 104857600))),
    CONSTRAINT asset_upload_reservations_operation_check CHECK ((operation = ANY (ARRAY['upload_picture'::text, 'upload_attachment'::text, 'upload_asset'::text, 'start_asset_upload'::text]))),
    CONSTRAINT asset_upload_reservations_publication_check CHECK ((publication = ANY (ARRAY['draft'::text, 'issue'::text]))),
    CONSTRAINT asset_upload_reservations_published_generation_check CHECK ((published_generation > 0)),
    CONSTRAINT asset_upload_reservations_received_bytes_check CHECK ((received_bytes >= 0)),
    CONSTRAINT asset_upload_reservations_staging_generation_check CHECK ((staging_generation > 0)),
    CONSTRAINT asset_upload_reservations_state_check CHECK ((state = ANY (ARRAY['uploading'::text, 'ready'::text, 'failed'::text, 'committed'::text, 'canceled'::text, 'expired'::text]))),
    CONSTRAINT asset_upload_reservations_upload_method_check CHECK ((upload_method = ANY (ARRAY['backend'::text, 'resumable'::text])))
);


--
-- Name: asset_upload_reservations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.asset_upload_reservations AS
 SELECT actor_id,
    retry_reference,
    operation,
    command_hash,
    asset_id,
    project_id,
    issue_id,
    kind,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    checksum,
    lease_until,
    state,
    expected_bytes,
    maximum_bytes,
    upload_method,
    upload_expires_at,
    storage_session,
    received_bytes,
    filename,
    description,
    mime_type,
    publication,
    last_chunk_hash,
    created_at,
    updated_at
   FROM public.upload_reservations;


--
-- Name: assignment_rule_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_rule_records (
    id uuid CONSTRAINT project_assignment_rules_id_not_null NOT NULL,
    project_id uuid CONSTRAINT project_assignment_rules_project_id_not_null NOT NULL,
    name text CONSTRAINT project_assignment_rules_name_not_null NOT NULL,
    assignee_id uuid CONSTRAINT project_assignment_rules_assignee_id_not_null NOT NULL,
    enabled boolean DEFAULT true CONSTRAINT project_assignment_rules_enabled_not_null NOT NULL,
    revision bigint DEFAULT 1 CONSTRAINT project_assignment_rules_revision_not_null NOT NULL,
    created_by uuid CONSTRAINT project_assignment_rules_created_by_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT project_assignment_rules_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT project_assignment_rules_updated_at_not_null NOT NULL,
    stage_id uuid,
    CONSTRAINT assignment_canonical_required CHECK ((stage_id IS NOT NULL)),
    CONSTRAINT project_assignment_rules_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100)))
);


--
-- Name: attachment_upload_reservations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.attachment_upload_reservations AS
 SELECT actor_id,
    retry_reference,
    command_hash,
    asset_id AS attachment_id,
    project_id,
    issue_id,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    lease_until,
    checksum,
    state,
    created_at,
    updated_at
   FROM public.upload_reservations
  WHERE (operation = 'upload_attachment'::text);


--
-- Name: board_column_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_column_stages (
    project_id uuid NOT NULL,
    board_id uuid NOT NULL,
    column_id uuid NOT NULL,
    stage_id uuid NOT NULL
);


--
-- Name: board_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_columns (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    board_id uuid NOT NULL,
    name text NOT NULL,
    "position" bigint NOT NULL,
    wip_limit integer,
    wip_mode text DEFAULT 'warn'::text NOT NULL,
    order_revision bigint DEFAULT 1 NOT NULL,
    legacy_status text,
    legacy_backfill_pending boolean DEFAULT false NOT NULL,
    CONSTRAINT board_columns_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT board_columns_order_revision_check CHECK ((order_revision > 0)),
    CONSTRAINT board_columns_position_check CHECK (("position" > 0)),
    CONSTRAINT board_columns_wip_limit_check CHECK ((wip_limit > 0)),
    CONSTRAINT board_columns_wip_mode_check CHECK ((wip_mode = ANY (ARRAY['warn'::text, 'block'::text])))
);


--
-- Name: board_issue_ranks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_issue_ranks (
    project_id uuid NOT NULL,
    board_id uuid NOT NULL,
    column_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    rank bigint NOT NULL,
    CONSTRAINT board_issue_ranks_rank_check CHECK ((rank >= 0))
);


--
-- Name: board_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_records (
    id uuid CONSTRAINT boards_id_not_null NOT NULL,
    project_id uuid CONSTRAINT boards_project_id_not_null NOT NULL,
    name text CONSTRAINT boards_name_not_null NOT NULL,
    name_key text CONSTRAINT boards_name_key_not_null NOT NULL,
    created_by uuid CONSTRAINT boards_created_by_not_null NOT NULL,
    is_default boolean DEFAULT false CONSTRAINT boards_is_default_not_null NOT NULL,
    saved_filters jsonb DEFAULT '{}'::jsonb CONSTRAINT boards_saved_filters_not_null NOT NULL,
    filters_version integer DEFAULT 1 CONSTRAINT boards_filters_version_not_null NOT NULL,
    revision bigint DEFAULT 1 CONSTRAINT boards_revision_not_null NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT boards_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT boards_updated_at_not_null NOT NULL,
    legacy_snapshot jsonb,
    CONSTRAINT boards_check CHECK (((NOT is_default) OR ((name = 'All Issues'::text) AND (name_key = 'all issues'::text) AND (saved_filters = '{}'::jsonb) AND (archived_at IS NULL)))),
    CONSTRAINT boards_filters_version_check CHECK ((filters_version = 1)),
    CONSTRAINT boards_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT boards_name_key_check CHECK ((name_key <> ''::text)),
    CONSTRAINT boards_revision_check CHECK ((revision > 0)),
    CONSTRAINT boards_saved_filters_check CHECK ((jsonb_typeof(saved_filters) = 'object'::text))
);


--
-- Name: workflow_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_stages (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    legacy_status text NOT NULL,
    "position" bigint NOT NULL,
    is_initial boolean DEFAULT false NOT NULL,
    accepts_entries boolean DEFAULT true NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    legacy_order_revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT workflow_stage_category_token CHECK ((category = split_part(legacy_status, ':'::text, 1))),
    CONSTRAINT workflow_stages_category_check CHECK ((category = ANY (ARRAY['todo'::text, 'in_progress'::text, 'review'::text, 'done'::text]))),
    CONSTRAINT workflow_stages_check CHECK (((NOT is_initial) OR ((NOT retired) AND accepts_entries))),
    CONSTRAINT workflow_stages_check1 CHECK (((NOT retired) OR (NOT accepts_entries))),
    CONSTRAINT workflow_stages_legacy_order_revision_check CHECK ((legacy_order_revision > 0)),
    CONSTRAINT workflow_stages_legacy_status_check CHECK ((legacy_status ~ '^(todo|in_progress|review|done)(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'::text)),
    CONSTRAINT workflow_stages_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT workflow_stages_position_check CHECK (("position" > 0))
);


--
-- Name: workflow_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_transitions (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    from_stage_id uuid NOT NULL,
    to_stage_id uuid NOT NULL,
    required_permission text,
    approvals_required smallint DEFAULT 0 NOT NULL,
    approver_role text,
    exclude_issue_reporter boolean DEFAULT false NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    CONSTRAINT workflow_transitions_approvals_required_check CHECK (((approvals_required >= 0) AND (approvals_required <= 100))),
    CONSTRAINT workflow_transitions_approver_role_check CHECK ((approver_role = ANY (ARRAY['member'::text, 'project_admin'::text]))),
    CONSTRAINT workflow_transitions_check CHECK ((from_stage_id <> to_stage_id)),
    CONSTRAINT workflow_transitions_check1 CHECK (((approvals_required = 0) = (approver_role IS NULL))),
    CONSTRAINT workflow_transitions_required_permission_check CHECK ((required_permission = ANY (ARRAY['member'::text, 'project_admin'::text])))
);


--
-- Name: boards; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.boards AS
 SELECT id,
    project_id,
    name,
    name_key,
    created_by,
    is_default,
    saved_filters,
    filters_version,
    ( SELECT c.wip_limit
           FROM public.board_columns c
          WHERE ((c.board_id = b.id) AND (c.legacy_status = 'in_progress'::text))) AS in_progress_limit,
    ( SELECT c.wip_limit
           FROM public.board_columns c
          WHERE ((c.board_id = b.id) AND (c.legacy_status = 'review'::text))) AS review_limit,
    revision,
    archived_at,
    created_at,
    updated_at,
    COALESCE(( SELECT jsonb_build_object('columns', jsonb_agg(jsonb_strip_nulls(jsonb_build_object('status', s.legacy_status, 'name', c.name, 'warningLimit', c.wip_limit, 'allowedTargets', COALESCE(( SELECT jsonb_agg(target.legacy_status ORDER BY target."position", target.id) AS jsonb_agg
                   FROM (public.workflow_transitions e
                     JOIN public.workflow_stages target ON ((target.id = e.to_stage_id)))
                  WHERE ((e.from_stage_id = s.id) AND (NOT e.retired))), '[]'::jsonb))) ORDER BY c."position", s."position", s.id)) AS jsonb_build_object
           FROM ((public.board_columns c
             JOIN public.board_column_stages m ON ((m.column_id = c.id)))
             JOIN public.workflow_stages s ON ((s.id = m.stage_id)))
          WHERE (c.board_id = b.id)), '{"columns": []}'::jsonb) AS workflow
   FROM public.board_records b;


--
-- Name: comment_version_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_version_attachments (
    comment_id uuid NOT NULL,
    version bigint NOT NULL,
    issue_id uuid NOT NULL,
    attachment_id uuid NOT NULL
);


--
-- Name: comment_version_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_version_mentions (
    comment_id uuid NOT NULL,
    version bigint NOT NULL,
    user_id uuid NOT NULL,
    display_label_snapshot text NOT NULL,
    CONSTRAINT comment_version_mentions_display_label_snapshot_check CHECK (((char_length(display_label_snapshot) >= 1) AND (char_length(display_label_snapshot) <= 100)))
);


--
-- Name: comment_version_pictures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.comment_version_pictures AS
 SELECT r.comment_id,
    r.version,
    r.issue_id,
    r.attachment_id AS picture_id
   FROM (public.comment_version_attachments r
     JOIN public.attachments a ON ((a.id = r.attachment_id)))
  WHERE (a.kind = 'image'::text);


--
-- Name: comment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_versions (
    comment_id uuid NOT NULL,
    revision bigint NOT NULL,
    issue_id uuid NOT NULL,
    safe_html text NOT NULL,
    plain_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_versions_plain_text_check CHECK ((char_length(plain_text) <= 10000)),
    CONSTRAINT comment_versions_revision_check CHECK ((revision > 0)),
    CONSTRAINT comment_versions_safe_html_check CHECK ((octet_length(safe_html) <= 65536))
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    author_id uuid NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    CONSTRAINT comments_revision_check CHECK ((revision > 0))
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    singleton boolean DEFAULT true NOT NULL,
    time_zone text DEFAULT 'Africa/Cairo'::text NOT NULL,
    cleanup_paused boolean DEFAULT false NOT NULL,
    CONSTRAINT company_settings_singleton_check CHECK (singleton)
);


--
-- Name: compatible_attachments; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.compatible_attachments AS
 SELECT id,
    project_id,
    issue_id,
    uploaded_by,
    filename,
    mime_type,
    byte_size,
    checksum,
    staging_key,
    staging_generation,
    COALESCE(published_key, ''::text) AS published_key,
    COALESCE(published_generation, (0)::bigint) AS published_generation,
    in_panel AS attached,
    uploaded_at
   FROM public.attachments
  WHERE ((kind = 'file'::text) AND (state = 'published'::text));


--
-- Name: compatible_pictures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.compatible_pictures AS
 SELECT id,
    project_id,
    issue_id,
    uploaded_by,
    filename,
    description,
    mime_type,
    byte_size,
    checksum,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    state,
    in_panel AS in_gallery,
    uploaded_at,
    expires_at,
    published_at
   FROM public.attachments
  WHERE (kind = 'image'::text);


--
-- Name: development_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.development_links (
    id uuid NOT NULL,
    issue_id uuid NOT NULL,
    url text NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT development_links_kind_check CHECK ((kind = ANY (ARRAY['pull_request'::text, 'commit'::text, 'other'::text]))),
    CONSTRAINT development_links_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200))),
    CONSTRAINT development_links_url_check CHECK (((char_length(url) >= 1) AND (char_length(url) <= 2000)))
);


--
-- Name: field_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_definitions (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    value_kind text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    default_text text,
    default_number numeric,
    default_date date,
    default_option_id uuid,
    default_user_id uuid,
    CONSTRAINT field_definitions_check CHECK ((NOT (required AND retired))),
    CONSTRAINT field_definitions_check1 CHECK ((((default_text IS NULL) AND (default_number IS NULL) AND (default_date IS NULL) AND (default_option_id IS NULL) AND (default_user_id IS NULL)) OR ((value_kind = 'text'::text) AND (default_text IS NOT NULL) AND (default_number IS NULL) AND (default_date IS NULL) AND (default_option_id IS NULL) AND (default_user_id IS NULL)) OR ((value_kind = 'number'::text) AND (default_text IS NULL) AND (default_number IS NOT NULL) AND (default_date IS NULL) AND (default_option_id IS NULL) AND (default_user_id IS NULL)) OR ((value_kind = 'date'::text) AND (default_text IS NULL) AND (default_number IS NULL) AND (default_date IS NOT NULL) AND (default_option_id IS NULL) AND (default_user_id IS NULL)) OR ((value_kind = 'choice'::text) AND (default_text IS NULL) AND (default_number IS NULL) AND (default_date IS NULL) AND (default_option_id IS NOT NULL) AND (default_user_id IS NULL)) OR ((value_kind = 'user'::text) AND (default_text IS NULL) AND (default_number IS NULL) AND (default_date IS NULL) AND (default_option_id IS NULL) AND (default_user_id IS NOT NULL)))),
    CONSTRAINT field_definitions_default_date_check CHECK (((default_date >= '0001-01-01'::date) AND (default_date <= '9999-12-31'::date))),
    CONSTRAINT field_definitions_default_number_check CHECK (((default_number IS NULL) OR ((default_number <> 'NaN'::numeric) AND (abs(default_number) < '10000000000000000000000000000'::numeric) AND (scale(default_number) <= 10)))),
    CONSTRAINT field_definitions_default_text_check CHECK ((char_length(default_text) <= 5000)),
    CONSTRAINT field_definitions_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,31}$'::text)),
    CONSTRAINT field_definitions_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT field_definitions_value_kind_check CHECK ((value_kind = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'choice'::text, 'user'::text])))
);


--
-- Name: field_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_options (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_kind text DEFAULT 'choice'::text NOT NULL,
    name text NOT NULL,
    "position" bigint NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    CONSTRAINT field_options_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT field_options_position_check CHECK (("position" > 0)),
    CONSTRAINT field_options_value_kind_check CHECK ((value_kind = 'choice'::text))
);


--
-- Name: goose_db_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goose_db_version (
    id integer NOT NULL,
    version_id bigint NOT NULL,
    is_applied boolean NOT NULL,
    tstamp timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.goose_db_version ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.goose_db_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: idempotency_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_records (
    actor_id uuid NOT NULL,
    retry_reference uuid NOT NULL,
    operation text NOT NULL,
    canonical_input_hash text NOT NULL,
    result jsonb,
    result_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    CONSTRAINT idempotency_records_canonical_input_hash_check CHECK ((canonical_input_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT idempotency_records_check CHECK ((expires_at >= (created_at + '48:00:00'::interval))),
    CONSTRAINT idempotency_records_result_version_check CHECK ((result_version = 1))
);


--
-- Name: issue_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_approvals (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    transition_id uuid NOT NULL,
    issue_revision bigint NOT NULL,
    workflow_revision bigint NOT NULL,
    configuration_revision bigint NOT NULL,
    approver_id uuid NOT NULL,
    decision text NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_approvals_configuration_revision_check CHECK ((configuration_revision > 0)),
    CONSTRAINT issue_approvals_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text]))),
    CONSTRAINT issue_approvals_issue_revision_check CHECK ((issue_revision > 0)),
    CONSTRAINT issue_approvals_workflow_revision_check CHECK ((workflow_revision > 0))
);


--
-- Name: issue_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_dependencies (
    project_id uuid NOT NULL,
    dependent_id uuid NOT NULL,
    blocker_id uuid NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_by uuid,
    removed_at timestamp with time zone,
    CONSTRAINT issue_dependencies_check CHECK ((dependent_id <> blocker_id)),
    CONSTRAINT issue_dependencies_check1 CHECK (((removed_at IS NULL) = (removed_by IS NULL))),
    CONSTRAINT issue_dependencies_revision_check CHECK ((revision > 0))
);


--
-- Name: issue_field_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_field_values (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_kind text NOT NULL,
    text_value text,
    number_value numeric,
    date_value date,
    option_id uuid,
    user_id uuid,
    CONSTRAINT issue_field_values_check CHECK ((((value_kind = 'text'::text) AND (text_value IS NOT NULL) AND (number_value IS NULL) AND (date_value IS NULL) AND (option_id IS NULL) AND (user_id IS NULL)) OR ((value_kind = 'number'::text) AND (text_value IS NULL) AND (number_value IS NOT NULL) AND (date_value IS NULL) AND (option_id IS NULL) AND (user_id IS NULL)) OR ((value_kind = 'date'::text) AND (text_value IS NULL) AND (number_value IS NULL) AND (date_value IS NOT NULL) AND (option_id IS NULL) AND (user_id IS NULL)) OR ((value_kind = 'choice'::text) AND (text_value IS NULL) AND (number_value IS NULL) AND (date_value IS NULL) AND (option_id IS NOT NULL) AND (user_id IS NULL)) OR ((value_kind = 'user'::text) AND (text_value IS NULL) AND (number_value IS NULL) AND (date_value IS NULL) AND (option_id IS NULL) AND (user_id IS NOT NULL)))),
    CONSTRAINT issue_field_values_date_value_check CHECK (((date_value >= '0001-01-01'::date) AND (date_value <= '9999-12-31'::date))),
    CONSTRAINT issue_field_values_number_value_check CHECK (((number_value IS NULL) OR ((number_value <> 'NaN'::numeric) AND (abs(number_value) < '10000000000000000000000000000'::numeric) AND (scale(number_value) <= 10)))),
    CONSTRAINT issue_field_values_text_value_check CHECK ((char_length(text_value) <= 5000))
);


--
-- Name: issue_import_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_import_sources (
    project_id uuid NOT NULL,
    source_key text NOT NULL,
    issue_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_import_sources_source_key_check CHECK (((char_length(source_key) >= 1) AND (char_length(source_key) <= 200)))
);


--
-- Name: issue_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_labels (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    label_id uuid NOT NULL
);


--
-- Name: issue_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_links (
    issue_id uuid NOT NULL,
    target_id uuid NOT NULL,
    kind text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    CONSTRAINT issue_links_check CHECK ((issue_id <> target_id)),
    CONSTRAINT issue_links_kind_check CHECK ((kind = ANY (ARRAY['relates_to'::text, 'duplicates'::text])))
);


--
-- Name: issue_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_records (
    id uuid CONSTRAINT issues_id_not_null NOT NULL,
    project_id uuid CONSTRAINT issues_project_id_not_null NOT NULL,
    number bigint CONSTRAINT issues_number_not_null NOT NULL,
    title text CONSTRAINT issues_title_not_null NOT NULL,
    description text DEFAULT ''::text CONSTRAINT issues_description_not_null NOT NULL,
    reporter_id uuid CONSTRAINT issues_reporter_id_not_null NOT NULL,
    assignee_id uuid,
    due_date date,
    parent_id uuid,
    revision bigint DEFAULT 1 CONSTRAINT issues_revision_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT issues_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT issues_updated_at_not_null NOT NULL,
    description_format text DEFAULT 'plain'::text CONSTRAINT issues_description_format_not_null NOT NULL,
    archived boolean DEFAULT false CONSTRAINT issues_archived_not_null NOT NULL,
    backlog boolean DEFAULT false CONSTRAINT issues_backlog_not_null NOT NULL,
    backlog_rank bigint DEFAULT 0 CONSTRAINT issues_backlog_rank_not_null NOT NULL,
    type_id uuid,
    priority_id uuid,
    workflow_id uuid,
    stage_id uuid,
    legacy_rank bigint,
    CONSTRAINT issue_canonical_shape CHECK ((((type_id IS NULL) AND (priority_id IS NULL) AND (workflow_id IS NULL) AND (stage_id IS NULL)) OR ((type_id IS NOT NULL) AND (priority_id IS NOT NULL) AND (workflow_id IS NOT NULL) AND (stage_id IS NOT NULL)))),
    CONSTRAINT issues_canonical_required CHECK (((type_id IS NOT NULL) AND (priority_id IS NOT NULL) AND (workflow_id IS NOT NULL) AND (stage_id IS NOT NULL))),
    CONSTRAINT issues_check1 CHECK ((parent_id IS DISTINCT FROM id)),
    CONSTRAINT issues_description_check CHECK ((char_length(description) <= 10000)),
    CONSTRAINT issues_description_format_check CHECK ((description_format = ANY (ARRAY['plain'::text, 'html'::text]))),
    CONSTRAINT issues_legacy_rank_check CHECK ((legacy_rank > 0)),
    CONSTRAINT issues_number_check CHECK ((number > 0)),
    CONSTRAINT issues_revision_check CHECK ((revision > 0)),
    CONSTRAINT issues_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);


--
-- Name: issue_type_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_type_workflows (
    project_id uuid NOT NULL,
    type_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    accepts_new boolean DEFAULT true NOT NULL,
    CONSTRAINT issue_type_workflows_check CHECK (((NOT is_default) OR accepts_new))
);


--
-- Name: issue_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_types (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    behavior text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    CONSTRAINT issue_types_behavior_check CHECK ((behavior = ANY (ARRAY['standard'::text, 'subtask'::text]))),
    CONSTRAINT issue_types_check CHECK (((NOT is_default) OR (NOT retired))),
    CONSTRAINT issue_types_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,31}$'::text)),
    CONSTRAINT issue_types_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)))
);


--
-- Name: issue_watchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_watchers (
    issue_id uuid NOT NULL,
    user_id uuid NOT NULL,
    watching boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.priorities (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    sort_order bigint NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    CONSTRAINT priorities_check CHECK (((NOT is_default) OR (NOT retired))),
    CONSTRAINT priorities_key_check CHECK ((key ~ '^[a-z][a-z0-9_]{0,31}$'::text)),
    CONSTRAINT priorities_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT priorities_sort_order_check CHECK ((sort_order > 0))
);


--
-- Name: issues; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.issues AS
 SELECT id,
    project_id,
    number,
    title,
    description,
    reporter_id,
    assignee_id,
    due_date,
    parent_id,
    revision,
    created_at,
    updated_at,
    description_format,
    archived,
    backlog,
    backlog_rank,
    type_id,
    priority_id,
    workflow_id,
    stage_id,
    COALESCE(( SELECT
                CASE
                    WHEN (t.behavior = 'subtask'::text) THEN 'subtask'::text
                    WHEN (t.key = 'bug'::text) THEN 'bug'::text
                    ELSE 'task'::text
                END AS "case"
           FROM public.issue_types t
          WHERE (t.id = i.type_id)), 'task'::text) AS type,
    COALESCE(( SELECT
                CASE
                    WHEN (p.key = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])) THEN p.key
                    ELSE 'medium'::text
                END AS "case"
           FROM public.priorities p
          WHERE (p.id = i.priority_id)), 'medium'::text) AS priority,
    COALESCE(( SELECT s.legacy_status
           FROM public.workflow_stages s
          WHERE (s.id = i.stage_id)), 'todo'::text) AS status,
    COALESCE(( SELECT r.rank
           FROM (public.board_issue_ranks r
             JOIN public.board_records b ON ((b.id = r.board_id)))
          WHERE ((r.issue_id = i.id) AND (b.project_id = i.project_id) AND b.is_default)), legacy_rank, (1024)::bigint) AS rank
   FROM public.issue_records i;


--
-- Name: labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labels (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    name_key text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT labels_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40))),
    CONSTRAINT labels_name_key_check CHECK ((name_key <> ''::text))
);


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_deliveries (
    id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    dedup_key text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT notification_deliveries_attempts_check CHECK (((attempts >= 0) AND (attempts <= 8))),
    CONSTRAINT notification_deliveries_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: notification_due_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_due_events (
    issue_id uuid NOT NULL,
    due_date date NOT NULL,
    event_id uuid NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    events text[] DEFAULT ARRAY['watching'::text, 'comment'::text, 'mention'::text, 'assignment'::text, 'status'::text, 'due_date'::text, 'dependency_blocked'::text, 'dependency_resolved'::text, 'subtask_created'::text, 'subtasks_completed'::text] NOT NULL,
    email_mode text DEFAULT 'off'::text NOT NULL,
    due_reminders boolean DEFAULT false NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_email_mode_check CHECK ((email_mode = ANY (ARRAY['off'::text, 'instant'::text, 'daily'::text]))),
    CONSTRAINT notification_preferences_events_check CHECK (((cardinality(events) <= 10) AND (events <@ ARRAY['watching'::text, 'comment'::text, 'mention'::text, 'assignment'::text, 'status'::text, 'due_date'::text, 'dependency_blocked'::text, 'dependency_resolved'::text, 'subtask_created'::text, 'subtasks_completed'::text]))),
    CONSTRAINT notification_preferences_revision_check CHECK ((revision > 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    event_id uuid NOT NULL,
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    reasons text[] NOT NULL,
    plain_text_summary text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    revision bigint DEFAULT 1 NOT NULL,
    show_in_app boolean DEFAULT true NOT NULL,
    CONSTRAINT notifications_check CHECK ((recipient_id <> actor_id)),
    CONSTRAINT notifications_plain_text_summary_check CHECK (((char_length(plain_text_summary) >= 1) AND (char_length(plain_text_summary) <= 1000))),
    CONSTRAINT notifications_reasons_check CHECK (((cardinality(reasons) >= 1) AND (cardinality(reasons) <= 10))),
    CONSTRAINT notifications_reasons_check1 CHECK ((reasons <@ ARRAY['comment'::text, 'mention'::text, 'assignment'::text, 'status'::text, 'due_date'::text, 'dependency_blocked'::text, 'dependency_resolved'::text, 'subtask_created'::text, 'subtasks_completed'::text, 'watching'::text])),
    CONSTRAINT notifications_revision_check CHECK ((revision > 0))
);


--
-- Name: picture_upload_reservations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.picture_upload_reservations AS
 SELECT actor_id,
    retry_reference,
    command_hash,
    asset_id AS picture_id,
    project_id,
    issue_id,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    lease_until,
    checksum,
    state,
    created_at,
    updated_at
   FROM public.upload_reservations
  WHERE (operation = 'upload_picture'::text);


--
-- Name: pictures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pictures AS
 SELECT id,
    project_id,
    issue_id,
    uploaded_by,
    filename,
    description,
    mime_type,
    byte_size,
    checksum,
    staging_key,
    staging_generation,
    published_key,
    published_generation,
    state,
    in_gallery,
    uploaded_at,
    expires_at,
    published_at
   FROM public.compatible_pictures;


--
-- Name: planning_status_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.planning_status_events AS
 SELECT e.id,
    e.issue_id,
    e.project_id,
    e.created_at,
    split_part((f.value ->> 'before'::text), ':'::text, 1) AS before_category,
    split_part((f.value ->> 'after'::text), ':'::text, 1) AS after_category
   FROM (public.activity_events e
     CROSS JOIN LATERAL jsonb_array_elements((e.changes -> 'fields'::text)) f(value))
  WHERE ((e.resource_kind = 'issue'::text) AND (e.issue_id IS NOT NULL) AND ((f.value ->> 'field'::text) = 'status'::text) AND ((f.value ->> 'after'::text) IS NOT NULL));


--
-- Name: planning_completion_cycles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.planning_completion_cycles AS
 WITH episodes AS (
         SELECT s.id,
            s.issue_id,
            s.project_id,
            s.created_at,
            s.before_category,
            s.after_category,
            COALESCE(sum(
                CASE
                    WHEN ((s.after_category = 'done'::text) AND (s.before_category IS DISTINCT FROM 'done'::text)) THEN 1
                    ELSE 0
                END) OVER (PARTITION BY s.project_id, s.issue_id ORDER BY s.created_at, s.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), (0)::bigint) AS episode
           FROM public.planning_status_events s
        ), timed AS (
         SELECT e.id,
            e.issue_id,
            e.project_id,
            e.created_at,
            e.before_category,
            e.after_category,
            e.episode,
            min(
                CASE
                    WHEN ((e.after_category = ANY (ARRAY['in_progress'::text, 'review'::text])) OR ((e.before_category = 'done'::text) AND (e.after_category <> 'done'::text))) THEN e.created_at
                    ELSE NULL::timestamp with time zone
                END) OVER (PARTITION BY e.project_id, e.issue_id, e.episode) AS started_at
           FROM episodes e
        )
 SELECT id,
    issue_id,
    project_id,
    created_at AS completed_at,
    started_at
   FROM timed
  WHERE ((after_category = 'done'::text) AND (before_category IS DISTINCT FROM 'done'::text));


--
-- Name: planning_issue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_issue (
    issue_id uuid NOT NULL,
    project_id uuid NOT NULL,
    epic_id uuid,
    release_id uuid,
    revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT planning_issue_revision_check CHECK ((revision > 0))
);


--
-- Name: planning_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_items (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    target_date date,
    status text DEFAULT 'planned'::text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planning_items_description_check CHECK ((char_length(description) <= 2000)),
    CONSTRAINT planning_items_kind_check CHECK ((kind = ANY (ARRAY['epic'::text, 'release'::text]))),
    CONSTRAINT planning_items_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT planning_items_revision_check CHECK ((revision > 0)),
    CONSTRAINT planning_items_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'complete'::text])))
);


--
-- Name: project_assignment_rules; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.project_assignment_rules AS
 SELECT id,
    project_id,
    name,
    assignee_id,
    enabled,
    revision,
    created_by,
    created_at,
    updated_at,
    stage_id,
    COALESCE(( SELECT s.legacy_status
           FROM public.workflow_stages s
          WHERE (s.id = r.stage_id)), 'todo'::text) AS stage
   FROM public.assignment_rule_records r;


--
-- Name: project_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_memberships (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_memberships_revision_check CHECK ((revision > 0)),
    CONSTRAINT project_memberships_role_check CHECK ((role = ANY (ARRAY['project_admin'::text, 'member'::text, 'viewer'::text])))
);


--
-- Name: project_status_order; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.project_status_order AS
 SELECT project_id,
    legacy_status AS status,
    legacy_order_revision AS revision,
    name AS stage_name,
    retired
   FROM public.workflow_stages s;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    next_issue_number bigint DEFAULT 1 NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    graph_revision bigint DEFAULT 1 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    backlog_revision bigint DEFAULT 1 NOT NULL,
    configuration_revision bigint DEFAULT 1 NOT NULL,
    core_mode text DEFAULT 'legacy'::text NOT NULL,
    CONSTRAINT projects_backlog_revision_check CHECK ((backlog_revision > 0)),
    CONSTRAINT projects_configuration_revision_check CHECK ((configuration_revision > 0)),
    CONSTRAINT projects_core_mode_check CHECK ((core_mode = ANY (ARRAY['legacy'::text, 'modern'::text]))),
    CONSTRAINT projects_description_check CHECK ((char_length(description) <= 2000)),
    CONSTRAINT projects_graph_revision_check CHECK ((graph_revision > 0)),
    CONSTRAINT projects_key_check CHECK ((key ~ '^[A-Z][A-Z0-9]{1,9}$'::text)),
    CONSTRAINT projects_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT projects_next_issue_number_check CHECK ((next_issue_number > 0)),
    CONSTRAINT projects_revision_check CHECK ((revision > 0))
);


--
-- Name: saved_issue_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_issue_searches (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saved_issue_searches_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
);


--
-- Name: transition_required_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transition_required_fields (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    transition_id uuid NOT NULL,
    system_field text,
    field_id uuid,
    CONSTRAINT transition_required_fields_check CHECK (((system_field IS NULL) <> (field_id IS NULL))),
    CONSTRAINT transition_required_fields_system_field_check CHECK ((system_field = ANY (ARRAY['assignee'::text, 'due_date'::text, 'description'::text])))
);


--
-- Name: user_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_identities (
    issuer text NOT NULL,
    subject text NOT NULL,
    user_id uuid NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_identities_check CHECK (((issuer <> ''::text) AND (subject <> ''::text)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    email_key text NOT NULL,
    display_name text NOT NULL,
    approved_at timestamp with time zone,
    disabled_at timestamp with time zone,
    is_administrator boolean DEFAULT false NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 100))),
    CONSTRAINT users_email_check CHECK (((char_length(email) >= 3) AND (char_length(email) <= 320))),
    CONSTRAINT users_email_key_check CHECK ((email_key <> ''::text)),
    CONSTRAINT users_revision_check CHECK ((revision > 0))
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    legacy_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflows_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT workflows_revision_check CHECK ((revision > 0))
);


--
-- Name: activity_events activity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);


--
-- Name: attachments asset_attachments_issue_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_issue_id_id_key UNIQUE (issue_id, id);


--
-- Name: attachments asset_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_pkey PRIMARY KEY (id);


--
-- Name: attachments asset_attachments_project_id_issue_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_project_id_issue_id_id_key UNIQUE (project_id, issue_id, id);


--
-- Name: attachments asset_attachments_published_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_published_key_key UNIQUE (published_key);


--
-- Name: attachments asset_attachments_staging_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_staging_key_key UNIQUE (staging_key);


--
-- Name: upload_reservations asset_upload_reservations_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_reservations
    ADD CONSTRAINT asset_upload_reservations_asset_id_key UNIQUE (asset_id);


--
-- Name: upload_reservations asset_upload_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_reservations
    ADD CONSTRAINT asset_upload_reservations_pkey PRIMARY KEY (actor_id, retry_reference);


--
-- Name: upload_reservations asset_upload_reservations_staging_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_reservations
    ADD CONSTRAINT asset_upload_reservations_staging_key_key UNIQUE (staging_key);


--
-- Name: board_column_stages board_column_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_column_stages
    ADD CONSTRAINT board_column_stages_pkey PRIMARY KEY (board_id, stage_id);


--
-- Name: board_columns board_columns_board_id_legacy_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_board_id_legacy_status_key UNIQUE (board_id, legacy_status);


--
-- Name: board_columns board_columns_board_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_board_id_position_key UNIQUE (board_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: board_columns board_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_pkey PRIMARY KEY (id);


--
-- Name: board_columns board_columns_project_id_board_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_project_id_board_id_id_key UNIQUE (project_id, board_id, id);


--
-- Name: board_issue_ranks board_issue_ranks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_issue_ranks
    ADD CONSTRAINT board_issue_ranks_pkey PRIMARY KEY (board_id, issue_id);


--
-- Name: board_records boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_records
    ADD CONSTRAINT boards_pkey PRIMARY KEY (id);


--
-- Name: board_records boards_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_records
    ADD CONSTRAINT boards_project_id_id_key UNIQUE (project_id, id);


--
-- Name: board_records boards_project_id_name_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_records
    ADD CONSTRAINT boards_project_id_name_key_key UNIQUE (project_id, name_key);


--
-- Name: comment_version_attachments comment_version_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_attachments
    ADD CONSTRAINT comment_version_attachments_pkey PRIMARY KEY (comment_id, version, attachment_id);


--
-- Name: comment_version_mentions comment_version_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_mentions
    ADD CONSTRAINT comment_version_mentions_pkey PRIMARY KEY (comment_id, version, user_id);


--
-- Name: comment_versions comment_versions_comment_id_revision_issue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_comment_id_revision_issue_id_key UNIQUE (comment_id, revision, issue_id);


--
-- Name: comment_versions comment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_pkey PRIMARY KEY (comment_id, revision);


--
-- Name: comments comments_issue_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_issue_id_id_key UNIQUE (issue_id, id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (singleton);


--
-- Name: development_links development_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.development_links
    ADD CONSTRAINT development_links_pkey PRIMARY KEY (id);


--
-- Name: field_definitions field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_pkey PRIMARY KEY (id);


--
-- Name: field_definitions field_definitions_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_project_id_id_key UNIQUE (project_id, id);


--
-- Name: field_definitions field_definitions_project_id_id_value_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_project_id_id_value_kind_key UNIQUE (project_id, id, value_kind);


--
-- Name: field_definitions field_definitions_project_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_project_id_key_key UNIQUE (project_id, key);


--
-- Name: field_options field_options_field_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_options
    ADD CONSTRAINT field_options_field_id_position_key UNIQUE (field_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: field_options field_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_options
    ADD CONSTRAINT field_options_pkey PRIMARY KEY (id);


--
-- Name: field_options field_options_project_id_field_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_options
    ADD CONSTRAINT field_options_project_id_field_id_id_key UNIQUE (project_id, field_id, id);


--
-- Name: goose_db_version goose_db_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goose_db_version
    ADD CONSTRAINT goose_db_version_pkey PRIMARY KEY (id);


--
-- Name: idempotency_records idempotency_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_pkey PRIMARY KEY (actor_id, retry_reference);


--
-- Name: issue_approvals issue_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_approvals
    ADD CONSTRAINT issue_approvals_pkey PRIMARY KEY (issue_id, transition_id, issue_revision, workflow_revision, configuration_revision, approver_id);


--
-- Name: issue_dependencies issue_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_dependencies
    ADD CONSTRAINT issue_dependencies_pkey PRIMARY KEY (dependent_id, blocker_id);


--
-- Name: issue_field_values issue_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_field_values
    ADD CONSTRAINT issue_field_values_pkey PRIMARY KEY (issue_id, field_id);


--
-- Name: issue_import_sources issue_import_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_import_sources
    ADD CONSTRAINT issue_import_sources_pkey PRIMARY KEY (project_id, source_key);


--
-- Name: issue_labels issue_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_labels
    ADD CONSTRAINT issue_labels_pkey PRIMARY KEY (issue_id, label_id);


--
-- Name: issue_links issue_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_links
    ADD CONSTRAINT issue_links_pkey PRIMARY KEY (issue_id, target_id, kind);


--
-- Name: issue_type_workflows issue_type_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_type_workflows
    ADD CONSTRAINT issue_type_workflows_pkey PRIMARY KEY (project_id, type_id, workflow_id);


--
-- Name: issue_types issue_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_types
    ADD CONSTRAINT issue_types_pkey PRIMARY KEY (id);


--
-- Name: issue_types issue_types_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_types
    ADD CONSTRAINT issue_types_project_id_id_key UNIQUE (project_id, id);


--
-- Name: issue_types issue_types_project_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_types
    ADD CONSTRAINT issue_types_project_id_key_key UNIQUE (project_id, key);


--
-- Name: issue_watchers issue_watchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_watchers
    ADD CONSTRAINT issue_watchers_pkey PRIMARY KEY (issue_id, user_id);


--
-- Name: issue_records issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_pkey PRIMARY KEY (id);


--
-- Name: issue_records issues_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_project_id_id_key UNIQUE (project_id, id);


--
-- Name: issue_records issues_project_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_project_id_number_key UNIQUE (project_id, number);


--
-- Name: labels labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_pkey PRIMARY KEY (id);


--
-- Name: labels labels_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_project_id_id_key UNIQUE (project_id, id);


--
-- Name: labels labels_project_id_name_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_project_id_name_key_key UNIQUE (project_id, name_key);


--
-- Name: notification_deliveries notification_deliveries_dedup_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_dedup_key_key UNIQUE (dedup_key);


--
-- Name: notification_deliveries notification_deliveries_notification_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_notification_id_key UNIQUE (notification_id);


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: notification_due_events notification_due_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_due_events
    ADD CONSTRAINT notification_due_events_event_id_key UNIQUE (event_id);


--
-- Name: notification_due_events notification_due_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_due_events
    ADD CONSTRAINT notification_due_events_pkey PRIMARY KEY (issue_id, due_date);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_event_id_issue_id_recipient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_issue_id_recipient_id_key UNIQUE (event_id, issue_id, recipient_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: planning_issue planning_issue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_issue
    ADD CONSTRAINT planning_issue_pkey PRIMARY KEY (issue_id);


--
-- Name: planning_items planning_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_pkey PRIMARY KEY (id);


--
-- Name: planning_items planning_items_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_project_id_id_key UNIQUE (project_id, id);


--
-- Name: priorities priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_pkey PRIMARY KEY (id);


--
-- Name: priorities priorities_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_project_id_id_key UNIQUE (project_id, id);


--
-- Name: priorities priorities_project_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_project_id_key_key UNIQUE (project_id, key);


--
-- Name: assignment_rule_records project_assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rule_records
    ADD CONSTRAINT project_assignment_rules_pkey PRIMARY KEY (id);


--
-- Name: project_memberships project_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: projects projects_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_key_key UNIQUE (key);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: saved_issue_searches saved_issue_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_issue_searches
    ADD CONSTRAINT saved_issue_searches_pkey PRIMARY KEY (id);


--
-- Name: transition_required_fields transition_required_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_required_fields
    ADD CONSTRAINT transition_required_fields_pkey PRIMARY KEY (id);


--
-- Name: user_identities user_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (issuer, subject);


--
-- Name: user_identities user_identities_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key_key UNIQUE (email_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workflow_stages workflow_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_stages
    ADD CONSTRAINT workflow_stages_pkey PRIMARY KEY (id);


--
-- Name: workflow_stages workflow_stages_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_stages
    ADD CONSTRAINT workflow_stages_project_id_id_key UNIQUE (project_id, id);


--
-- Name: workflow_stages workflow_stages_project_id_legacy_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_stages
    ADD CONSTRAINT workflow_stages_project_id_legacy_status_key UNIQUE (project_id, legacy_status);


--
-- Name: workflow_stages workflow_stages_project_id_workflow_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_stages
    ADD CONSTRAINT workflow_stages_project_id_workflow_id_id_key UNIQUE (project_id, workflow_id, id);


--
-- Name: workflow_transitions workflow_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_transitions workflow_transitions_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_project_id_id_key UNIQUE (project_id, id);


--
-- Name: workflow_transitions workflow_transitions_project_id_workflow_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_project_id_workflow_id_id_key UNIQUE (project_id, workflow_id, id);


--
-- Name: workflow_transitions workflow_transitions_workflow_id_from_stage_id_to_stage_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_workflow_id_from_stage_id_to_stage_id_key UNIQUE (workflow_id, from_stage_id, to_stage_id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_project_id_id_key UNIQUE (project_id, id);


--
-- Name: activity_events_company_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_events_company_page_idx ON public.activity_events USING btree (created_at DESC, id DESC);


--
-- Name: activity_events_issue_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_events_issue_page_idx ON public.activity_events USING btree (issue_id, created_at DESC, id DESC);


--
-- Name: activity_events_project_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_events_project_page_idx ON public.activity_events USING btree (project_id, created_at DESC, id DESC);


--
-- Name: activity_issue_transitions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_issue_transitions ON public.activity_events USING btree (project_id, issue_id, created_at, id) WHERE (resource_kind = 'issue'::text);


--
-- Name: asset_attachments_drafts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_attachments_drafts ON public.attachments USING btree (uploaded_by, issue_id, uploaded_at, id) WHERE (state = 'draft'::text);


--
-- Name: asset_attachments_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_attachments_expiry ON public.attachments USING btree (expires_at, id) WHERE (state = 'draft'::text);


--
-- Name: asset_attachments_panel_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_attachments_panel_page ON public.attachments USING btree (issue_id, uploaded_at, id) WHERE (in_panel AND (state = 'published'::text));


--
-- Name: asset_upload_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_upload_cleanup ON public.upload_reservations USING btree (state, upload_expires_at, lease_until, asset_id);


--
-- Name: assignment_rule_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assignment_rule_stage ON public.assignment_rule_records USING btree (project_id, stage_id) WHERE enabled;


--
-- Name: board_column_stages_column; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_column_stages_column ON public.board_column_stages USING btree (column_id, stage_id);


--
-- Name: board_column_stages_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_column_stages_stage ON public.board_column_stages USING btree (project_id, stage_id, board_id, column_id);


--
-- Name: board_columns_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_columns_page ON public.board_columns USING btree (board_id, "position", id);


--
-- Name: board_issue_ranks_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_issue_ranks_issue ON public.board_issue_ranks USING btree (project_id, issue_id, board_id);


--
-- Name: board_issue_ranks_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_issue_ranks_page ON public.board_issue_ranks USING btree (board_id, column_id, rank, issue_id);


--
-- Name: boards_name_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX boards_name_page_idx ON public.board_records USING btree (project_id, name_key, id);


--
-- Name: boards_one_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX boards_one_default_idx ON public.board_records USING btree (project_id) WHERE is_default;


--
-- Name: comments_discussion_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_discussion_page_idx ON public.comments USING btree (issue_id, created_at, id);


--
-- Name: dependencies_blocker_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dependencies_blocker_active_idx ON public.issue_dependencies USING btree (project_id, blocker_id, dependent_id) WHERE (removed_at IS NULL);


--
-- Name: dependencies_dependent_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dependencies_dependent_active_idx ON public.issue_dependencies USING btree (project_id, dependent_id, blocker_id) WHERE (removed_at IS NULL);


--
-- Name: development_links_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX development_links_issue ON public.development_links USING btree (issue_id, created_at, id) WHERE (NOT removed);


--
-- Name: field_definitions_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_definitions_page ON public.field_definitions USING btree (project_id, id);


--
-- Name: field_options_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_options_page ON public.field_options USING btree (project_id, field_id, "position", id);


--
-- Name: idempotency_records_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_records_expiry_idx ON public.idempotency_records USING btree (expires_at, actor_id, retry_reference);


--
-- Name: issue_approvals_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_approvals_history ON public.issue_approvals USING btree (issue_id, transition_id, decided_at DESC, approver_id DESC, issue_revision DESC, workflow_revision DESC, configuration_revision DESC);


--
-- Name: issue_field_definition_values; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_field_definition_values ON public.issue_field_values USING btree (project_id, field_id, issue_id);


--
-- Name: issue_labels_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_labels_filter_idx ON public.issue_labels USING btree (project_id, label_id, issue_id);


--
-- Name: issue_links_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_links_target ON public.issue_links USING btree (target_id) WHERE (removed_at IS NULL);


--
-- Name: issue_type_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX issue_type_default ON public.issue_types USING btree (project_id, behavior) WHERE is_default;


--
-- Name: issue_type_workflow_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX issue_type_workflow_default ON public.issue_type_workflows USING btree (project_id, type_id) WHERE is_default;


--
-- Name: issues_active_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_active_project ON public.issue_records USING btree (project_id, updated_at DESC, id DESC) WHERE (NOT archived);


--
-- Name: issues_active_stage_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_active_stage_count ON public.issue_records USING btree (project_id, stage_id) WHERE ((NOT archived) AND (NOT backlog));


--
-- Name: issues_assignee_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_assignee_page_idx ON public.issue_records USING btree (assignee_id, updated_at DESC, id DESC);


--
-- Name: issues_backlog_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_backlog_order ON public.issue_records USING btree (project_id, backlog_rank, id) WHERE (backlog AND (NOT archived));


--
-- Name: issues_board_stage_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_board_stage_page ON public.issue_records USING btree (project_id, stage_id, created_at, id) WHERE ((NOT archived) AND (NOT backlog));


--
-- Name: issues_board_unranked_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_board_unranked_page ON public.issue_records USING btree (project_id, created_at, id) WHERE ((NOT archived) AND (NOT backlog));


--
-- Name: issues_configuration_backfill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_configuration_backfill ON public.issue_records USING btree (project_id, id) WHERE (type_id IS NULL);


--
-- Name: issues_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_due_date_idx ON public.issue_records USING btree (project_id, due_date, id) WHERE (due_date IS NOT NULL);


--
-- Name: issues_modified_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_modified_page_idx ON public.issue_records USING btree (project_id, updated_at DESC, id DESC);


--
-- Name: issues_number_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_number_lookup ON public.issue_records USING btree (number, project_id, id);


--
-- Name: issues_parent_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_parent_page ON public.issue_records USING btree (parent_id, number, id) INCLUDE (stage_id) WHERE (parent_id IS NOT NULL);


--
-- Name: issues_priority_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_priority_usage ON public.issue_records USING btree (project_id, priority_id, id);


--
-- Name: issues_reminder_due_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_reminder_due_canonical ON public.issue_records USING btree (due_date, id) INCLUDE (stage_id) WHERE ((due_date IS NOT NULL) AND (NOT archived));


--
-- Name: issues_stage_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_stage_usage ON public.issue_records USING btree (project_id, workflow_id, stage_id, id);


--
-- Name: issues_title_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_title_search_idx ON public.issue_records USING gin (title public.gin_trgm_ops);


--
-- Name: issues_type_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_type_usage ON public.issue_records USING btree (project_id, type_id, id);


--
-- Name: issues_updated_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issues_updated_global ON public.issue_records USING btree (updated_at DESC, id DESC);


--
-- Name: notification_deliveries_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_deliveries_pending ON public.notification_deliveries USING btree (available_at, id) WHERE (state = 'pending'::text);


--
-- Name: notification_delivery_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_delivery_events ON public.notifications USING btree (created_at, id);


--
-- Name: notifications_inbox_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_inbox_page_idx ON public.notifications USING btree (recipient_id, created_at DESC, id DESC);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (recipient_id, project_id) WHERE (read_at IS NULL);


--
-- Name: planning_epic_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planning_epic_progress ON public.planning_issue USING btree (epic_id, issue_id) WHERE (epic_id IS NOT NULL);


--
-- Name: planning_project_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planning_project_page ON public.planning_items USING btree (project_id, kind, name COLLATE "C", id);


--
-- Name: planning_release_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planning_release_progress ON public.planning_issue USING btree (release_id, issue_id) WHERE (release_id IS NOT NULL);


--
-- Name: priorities_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX priorities_order ON public.priorities USING btree (project_id, sort_order, id);


--
-- Name: priority_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX priority_default ON public.priorities USING btree (project_id) WHERE is_default;


--
-- Name: project_memberships_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_memberships_user_active_idx ON public.project_memberships USING btree (user_id, project_id) WHERE (removed_at IS NULL);


--
-- Name: projects_name_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_name_page_idx ON public.projects USING btree (name, id);


--
-- Name: retained_attachment_references; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX retained_attachment_references ON public.comment_version_attachments USING btree (attachment_id, comment_id, version);


--
-- Name: saved_issue_search_names; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX saved_issue_search_names ON public.saved_issue_searches USING btree (user_id, lower(name)) WHERE (NOT removed);


--
-- Name: transition_required_custom; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transition_required_custom ON public.transition_required_fields USING btree (transition_id, field_id) WHERE (field_id IS NOT NULL);


--
-- Name: transition_required_field_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transition_required_field_usage ON public.transition_required_fields USING btree (project_id, field_id, transition_id) WHERE (field_id IS NOT NULL);


--
-- Name: transition_required_system; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transition_required_system ON public.transition_required_fields USING btree (transition_id, system_field) WHERE (system_field IS NOT NULL);


--
-- Name: users_active_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_active_admin_idx ON public.users USING btree (id) WHERE (is_administrator AND (approved_at IS NOT NULL) AND (disabled_at IS NULL));


--
-- Name: workflow_initial_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workflow_initial_stage ON public.workflow_stages USING btree (workflow_id) WHERE (is_initial AND (NOT retired));


--
-- Name: workflow_stage_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_stage_list ON public.workflow_stages USING btree (workflow_id, "position", id);


--
-- Name: workflow_transitions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_transitions_active ON public.workflow_transitions USING btree (workflow_id, from_stage_id, to_stage_id) WHERE (NOT retired);


--
-- Name: workflows_legacy_bridge; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workflows_legacy_bridge ON public.workflows USING btree (project_id) WHERE legacy_default;


--
-- Name: workflows_names; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workflows_names ON public.workflows USING btree (project_id, lower(name));


--
-- Name: activity_events activity_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_events_immutable BEFORE DELETE OR UPDATE ON public.activity_events FOR EACH ROW EXECUTE FUNCTION public.immutable_history();


--
-- Name: issue_approvals approval_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_history BEFORE DELETE OR UPDATE ON public.issue_approvals FOR EACH ROW EXECUTE FUNCTION public.preserve_approval_history();


--
-- Name: upload_reservations asset_session_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER asset_session_identity BEFORE UPDATE ON public.upload_reservations FOR EACH ROW EXECUTE FUNCTION public.preserve_asset_session_identity();


--
-- Name: attachments assets_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assets_immutable BEFORE UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.preserve_asset_identity();


--
-- Name: attachments assets_retained; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assets_retained BEFORE DELETE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.immutable_history();


--
-- Name: board_columns board_columns_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER board_columns_identity BEFORE UPDATE ON public.board_columns FOR EACH ROW EXECUTE FUNCTION public.preserve_board_column_identity();


--
-- Name: boards boards_contract_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boards_contract_write INSTEAD OF INSERT OR UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.write_board_contract();


--
-- Name: board_records boards_snapshot_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boards_snapshot_immutable BEFORE UPDATE ON public.board_records FOR EACH ROW EXECUTE FUNCTION public.preserve_legacy_board_snapshot();


--
-- Name: comment_version_mentions comment_version_mentions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comment_version_mentions_immutable BEFORE DELETE OR UPDATE ON public.comment_version_mentions FOR EACH ROW EXECUTE FUNCTION public.immutable_history();


--
-- Name: comment_versions comment_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comment_versions_immutable BEFORE DELETE OR UPDATE ON public.comment_versions FOR EACH ROW EXECUTE FUNCTION public.immutable_history();


--
-- Name: comments comments_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_identity BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.preserve_comment_identity();


--
-- Name: field_definitions field_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER field_identity BEFORE UPDATE ON public.field_definitions FOR EACH ROW EXECUTE FUNCTION public.preserve_field_identity();


--
-- Name: field_options field_option_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER field_option_identity BEFORE UPDATE ON public.field_options FOR EACH ROW EXECUTE FUNCTION public.preserve_field_option_identity();


--
-- Name: issue_types issue_types_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER issue_types_identity BEFORE UPDATE ON public.issue_types FOR EACH ROW EXECUTE FUNCTION public.preserve_configuration_identity();


--
-- Name: issue_records issues_canonical_shape; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER issues_canonical_shape BEFORE INSERT OR UPDATE OF type_id, parent_id, legacy_rank ON public.issue_records FOR EACH ROW EXECUTE FUNCTION public.check_canonical_issue_shape();


--
-- Name: issues issues_contract_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER issues_contract_write INSTEAD OF INSERT OR UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION public.write_issue_contract();


--
-- Name: issue_records issues_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER issues_identity BEFORE UPDATE ON public.issue_records FOR EACH ROW EXECUTE FUNCTION public.preserve_issue_identity();


--
-- Name: issue_records issues_native_board_stage_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER issues_native_board_stage_order AFTER INSERT OR UPDATE OF stage_id ON public.issue_records FOR EACH ROW EXECUTE FUNCTION public.advance_native_board_stage_order();


--
-- Name: pictures pictures_contract_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pictures_contract_insert INSTEAD OF INSERT ON public.pictures FOR EACH ROW EXECUTE FUNCTION public.insert_picture_contract();


--
-- Name: priorities priorities_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER priorities_identity BEFORE UPDATE ON public.priorities FOR EACH ROW EXECUTE FUNCTION public.preserve_configuration_identity();


--
-- Name: projects projects_configuration_bridge; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_configuration_bridge AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.bridge_legacy_project();


--
-- Name: projects projects_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_identity BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.preserve_identity();


--
-- Name: project_assignment_rules rules_contract_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rules_contract_write INSTEAD OF INSERT OR UPDATE ON public.project_assignment_rules FOR EACH ROW EXECUTE FUNCTION public.write_assignment_rule_contract();


--
-- Name: project_status_order status_contract_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER status_contract_write INSTEAD OF INSERT OR UPDATE ON public.project_status_order FOR EACH ROW EXECUTE FUNCTION public.write_legacy_order();


--
-- Name: users users_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_identity BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.preserve_identity();


--
-- Name: workflow_stages workflow_stages_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workflow_stages_identity BEFORE UPDATE ON public.workflow_stages FOR EACH ROW EXECUTE FUNCTION public.preserve_configuration_identity();


--
-- Name: workflows workflows_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workflows_identity BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.preserve_configuration_identity();


--
-- Name: activity_events activity_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: activity_events activity_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: activity_events activity_events_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: attachments asset_attachments_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: attachments asset_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT asset_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: upload_reservations asset_upload_reservations_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_reservations
    ADD CONSTRAINT asset_upload_reservations_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: upload_reservations asset_upload_reservations_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_reservations
    ADD CONSTRAINT asset_upload_reservations_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: assignment_rule_records assignment_stage_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rule_records
    ADD CONSTRAINT assignment_stage_scope FOREIGN KEY (project_id, stage_id) REFERENCES public.workflow_stages(project_id, id);


--
-- Name: board_column_stages board_column_stages_project_id_board_id_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_column_stages
    ADD CONSTRAINT board_column_stages_project_id_board_id_column_id_fkey FOREIGN KEY (project_id, board_id, column_id) REFERENCES public.board_columns(project_id, board_id, id) ON DELETE CASCADE;


--
-- Name: board_column_stages board_column_stages_project_id_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_column_stages
    ADD CONSTRAINT board_column_stages_project_id_stage_id_fkey FOREIGN KEY (project_id, stage_id) REFERENCES public.workflow_stages(project_id, id);


--
-- Name: board_columns board_columns_project_id_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_project_id_board_id_fkey FOREIGN KEY (project_id, board_id) REFERENCES public.board_records(project_id, id);


--
-- Name: board_issue_ranks board_issue_ranks_project_id_board_id_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_issue_ranks
    ADD CONSTRAINT board_issue_ranks_project_id_board_id_column_id_fkey FOREIGN KEY (project_id, board_id, column_id) REFERENCES public.board_columns(project_id, board_id, id) ON DELETE CASCADE;


--
-- Name: board_issue_ranks board_issue_ranks_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_issue_ranks
    ADD CONSTRAINT board_issue_ranks_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: board_records boards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_records
    ADD CONSTRAINT boards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: board_records boards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_records
    ADD CONSTRAINT boards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: comment_version_attachments comment_version_attachments_comment_id_version_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_attachments
    ADD CONSTRAINT comment_version_attachments_comment_id_version_issue_id_fkey FOREIGN KEY (comment_id, version, issue_id) REFERENCES public.comment_versions(comment_id, revision, issue_id);


--
-- Name: comment_version_attachments comment_version_attachments_issue_id_attachment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_attachments
    ADD CONSTRAINT comment_version_attachments_issue_id_attachment_id_fkey FOREIGN KEY (issue_id, attachment_id) REFERENCES public.attachments(issue_id, id);


--
-- Name: comment_version_mentions comment_version_mentions_comment_id_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_mentions
    ADD CONSTRAINT comment_version_mentions_comment_id_version_fkey FOREIGN KEY (comment_id, version) REFERENCES public.comment_versions(comment_id, revision) ON DELETE RESTRICT;


--
-- Name: comment_version_mentions comment_version_mentions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_version_mentions
    ADD CONSTRAINT comment_version_mentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: comment_versions comment_versions_issue_id_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_versions
    ADD CONSTRAINT comment_versions_issue_id_comment_id_fkey FOREIGN KEY (issue_id, comment_id) REFERENCES public.comments(issue_id, id) ON DELETE RESTRICT;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: comments comments_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_current_version_fk FOREIGN KEY (id, revision) REFERENCES public.comment_versions(comment_id, revision) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: comments comments_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: development_links development_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.development_links
    ADD CONSTRAINT development_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: development_links development_links_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.development_links
    ADD CONSTRAINT development_links_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: field_definitions field_default_option_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_default_option_scope FOREIGN KEY (project_id, id, default_option_id) REFERENCES public.field_options(project_id, field_id, id);


--
-- Name: field_definitions field_definitions_default_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_default_user_id_fkey FOREIGN KEY (default_user_id) REFERENCES public.users(id);


--
-- Name: field_definitions field_definitions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definitions
    ADD CONSTRAINT field_definitions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: field_options field_options_project_id_field_id_value_kind_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_options
    ADD CONSTRAINT field_options_project_id_field_id_value_kind_fkey FOREIGN KEY (project_id, field_id, value_kind) REFERENCES public.field_definitions(project_id, id, value_kind);


--
-- Name: idempotency_records idempotency_records_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: issue_approvals issue_approvals_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_approvals
    ADD CONSTRAINT issue_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.users(id);


--
-- Name: issue_approvals issue_approvals_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_approvals
    ADD CONSTRAINT issue_approvals_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: issue_approvals issue_approvals_project_id_transition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_approvals
    ADD CONSTRAINT issue_approvals_project_id_transition_id_fkey FOREIGN KEY (project_id, transition_id) REFERENCES public.workflow_transitions(project_id, id);


--
-- Name: issue_dependencies issue_dependencies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_dependencies
    ADD CONSTRAINT issue_dependencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: issue_dependencies issue_dependencies_project_id_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_dependencies
    ADD CONSTRAINT issue_dependencies_project_id_blocker_id_fkey FOREIGN KEY (project_id, blocker_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: issue_dependencies issue_dependencies_project_id_dependent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_dependencies
    ADD CONSTRAINT issue_dependencies_project_id_dependent_id_fkey FOREIGN KEY (project_id, dependent_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: issue_dependencies issue_dependencies_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_dependencies
    ADD CONSTRAINT issue_dependencies_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: issue_field_values issue_field_values_project_id_field_id_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_field_values
    ADD CONSTRAINT issue_field_values_project_id_field_id_option_id_fkey FOREIGN KEY (project_id, field_id, option_id) REFERENCES public.field_options(project_id, field_id, id);


--
-- Name: issue_field_values issue_field_values_project_id_field_id_value_kind_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_field_values
    ADD CONSTRAINT issue_field_values_project_id_field_id_value_kind_fkey FOREIGN KEY (project_id, field_id, value_kind) REFERENCES public.field_definitions(project_id, id, value_kind);


--
-- Name: issue_field_values issue_field_values_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_field_values
    ADD CONSTRAINT issue_field_values_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: issue_field_values issue_field_values_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_field_values
    ADD CONSTRAINT issue_field_values_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: issue_import_sources issue_import_sources_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_import_sources
    ADD CONSTRAINT issue_import_sources_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: issue_import_sources issue_import_sources_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_import_sources
    ADD CONSTRAINT issue_import_sources_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: issue_labels issue_labels_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_labels
    ADD CONSTRAINT issue_labels_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: issue_labels issue_labels_project_id_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_labels
    ADD CONSTRAINT issue_labels_project_id_label_id_fkey FOREIGN KEY (project_id, label_id) REFERENCES public.labels(project_id, id) ON DELETE RESTRICT;


--
-- Name: issue_links issue_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_links
    ADD CONSTRAINT issue_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: issue_links issue_links_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_links
    ADD CONSTRAINT issue_links_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: issue_links issue_links_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_links
    ADD CONSTRAINT issue_links_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.issue_records(id);


--
-- Name: issue_records issue_priority_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issue_priority_scope FOREIGN KEY (project_id, priority_id) REFERENCES public.priorities(project_id, id);


--
-- Name: issue_records issue_type_workflow_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issue_type_workflow_scope FOREIGN KEY (project_id, type_id, workflow_id) REFERENCES public.issue_type_workflows(project_id, type_id, workflow_id);


--
-- Name: issue_type_workflows issue_type_workflows_project_id_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_type_workflows
    ADD CONSTRAINT issue_type_workflows_project_id_type_id_fkey FOREIGN KEY (project_id, type_id) REFERENCES public.issue_types(project_id, id);


--
-- Name: issue_type_workflows issue_type_workflows_project_id_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_type_workflows
    ADD CONSTRAINT issue_type_workflows_project_id_workflow_id_fkey FOREIGN KEY (project_id, workflow_id) REFERENCES public.workflows(project_id, id);


--
-- Name: issue_types issue_types_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_types
    ADD CONSTRAINT issue_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: issue_watchers issue_watchers_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_watchers
    ADD CONSTRAINT issue_watchers_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: issue_watchers issue_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_watchers
    ADD CONSTRAINT issue_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: issue_records issue_workflow_stage_scope; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issue_workflow_stage_scope FOREIGN KEY (project_id, workflow_id, stage_id) REFERENCES public.workflow_stages(project_id, workflow_id, id);


--
-- Name: issue_records issues_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: issue_records issues_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: issue_records issues_project_id_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_project_id_parent_id_fkey FOREIGN KEY (project_id, parent_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: issue_records issues_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_records
    ADD CONSTRAINT issues_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: labels labels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: labels labels_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: notification_deliveries notification_deliveries_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: notification_deliveries notification_deliveries_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id);


--
-- Name: notification_deliveries notification_deliveries_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: notification_due_events notification_due_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_due_events
    ADD CONSTRAINT notification_due_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.activity_events(id);


--
-- Name: notification_due_events notification_due_events_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_due_events
    ADD CONSTRAINT notification_due_events_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issue_records(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.activity_events(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: planning_issue planning_issue_project_id_epic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_issue
    ADD CONSTRAINT planning_issue_project_id_epic_id_fkey FOREIGN KEY (project_id, epic_id) REFERENCES public.planning_items(project_id, id);


--
-- Name: planning_issue planning_issue_project_id_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_issue
    ADD CONSTRAINT planning_issue_project_id_issue_id_fkey FOREIGN KEY (project_id, issue_id) REFERENCES public.issue_records(project_id, id);


--
-- Name: planning_issue planning_issue_project_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_issue
    ADD CONSTRAINT planning_issue_project_id_release_id_fkey FOREIGN KEY (project_id, release_id) REFERENCES public.planning_items(project_id, id);


--
-- Name: planning_items planning_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: planning_items planning_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: priorities priorities_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: assignment_rule_records project_assignment_rules_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rule_records
    ADD CONSTRAINT project_assignment_rules_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: assignment_rule_records project_assignment_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rule_records
    ADD CONSTRAINT project_assignment_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assignment_rule_records project_assignment_rules_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rule_records
    ADD CONSTRAINT project_assignment_rules_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: project_memberships project_memberships_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: project_memberships project_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: saved_issue_searches saved_issue_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_issue_searches
    ADD CONSTRAINT saved_issue_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: transition_required_fields transition_required_fields_project_id_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_required_fields
    ADD CONSTRAINT transition_required_fields_project_id_field_id_fkey FOREIGN KEY (project_id, field_id) REFERENCES public.field_definitions(project_id, id);


--
-- Name: transition_required_fields transition_required_fields_project_id_workflow_id_transiti_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transition_required_fields
    ADD CONSTRAINT transition_required_fields_project_id_workflow_id_transiti_fkey FOREIGN KEY (project_id, workflow_id, transition_id) REFERENCES public.workflow_transitions(project_id, workflow_id, id);


--
-- Name: user_identities user_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: workflow_stages workflow_stages_project_id_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_stages
    ADD CONSTRAINT workflow_stages_project_id_workflow_id_fkey FOREIGN KEY (project_id, workflow_id) REFERENCES public.workflows(project_id, id);


--
-- Name: workflow_transitions workflow_transitions_project_id_workflow_id_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_project_id_workflow_id_from_stage_id_fkey FOREIGN KEY (project_id, workflow_id, from_stage_id) REFERENCES public.workflow_stages(project_id, workflow_id, id);


--
-- Name: workflow_transitions workflow_transitions_project_id_workflow_id_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_project_id_workflow_id_to_stage_id_fkey FOREIGN KEY (project_id, workflow_id, to_stage_id) REFERENCES public.workflow_stages(project_id, workflow_id, id);


--
-- Name: workflows workflows_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- PostgreSQL database dump complete
--

\unrestrict JTGvIhMI93QuIDhqOhmeQLjScHssPfZvOVNMmLZygp4FM6wWqoMxdzzeaw2DddA

