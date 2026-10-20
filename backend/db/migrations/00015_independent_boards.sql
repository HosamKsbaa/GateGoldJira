-- +goose Up
-- Expand board-owned layout/order. V1 JSON and shared ranks remain intact until
-- the native client and all occupancy-changing commands are verified.
CREATE TABLE board_columns (
 id uuid PRIMARY KEY,project_id uuid NOT NULL,board_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 60),
 position bigint NOT NULL CHECK(position>0),wip_limit integer CHECK(wip_limit>0),
 wip_mode text NOT NULL DEFAULT 'warn' CHECK(wip_mode IN('warn','block')),
 order_revision bigint NOT NULL DEFAULT 1 CHECK(order_revision>0),
 legacy_status text,legacy_backfill_pending boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,board_id,id),UNIQUE(board_id,legacy_status),
 UNIQUE(board_id,position) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(project_id,board_id) REFERENCES boards(project_id,id)
);
CREATE INDEX board_columns_page ON board_columns(board_id,position,id);
CREATE TABLE board_column_stages (
 project_id uuid NOT NULL,board_id uuid NOT NULL,column_id uuid NOT NULL,stage_id uuid NOT NULL,
 PRIMARY KEY(board_id,stage_id),
 FOREIGN KEY(project_id,board_id,column_id) REFERENCES board_columns(project_id,board_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,stage_id) REFERENCES workflow_stages(project_id,id)
);
CREATE INDEX board_column_stages_column ON board_column_stages(column_id,stage_id);
CREATE INDEX board_column_stages_stage ON board_column_stages(project_id,stage_id,board_id,column_id);
CREATE TABLE board_issue_ranks (
 project_id uuid NOT NULL,board_id uuid NOT NULL,column_id uuid NOT NULL,issue_id uuid NOT NULL,
 rank bigint NOT NULL CHECK(rank>=0),PRIMARY KEY(board_id,issue_id),
 FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),
 FOREIGN KEY(project_id,board_id,column_id) REFERENCES board_columns(project_id,board_id,id) ON DELETE CASCADE
);
CREATE INDEX board_issue_ranks_page ON board_issue_ranks(board_id,column_id,rank,issue_id);
CREATE INDEX board_issue_ranks_issue ON board_issue_ranks(project_id,issue_id,board_id);

-- Owner-only, guarded batches prepare old layouts after expansion commits. The
-- bridge is installed before reading old ranks, so concurrent legacy writers
-- cannot leave a stale copy between the snapshot and trigger installation.
-- Mirror only legacy writers during expansion. Modern issue content edits never
-- rewrite ranks in every board, and modern ordering owns its column revisions.
-- +goose StatementBegin
CREATE FUNCTION prepare_legacy_board_layout(p_board uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b boards%ROWTYPE;item record;col uuid;stage uuid;order_rev bigint;lim integer;
BEGIN
 SELECT source.* INTO b FROM boards source WHERE source.id=p_board;
 IF NOT FOUND THEN RETURN; END IF;
 FOR item IN SELECT value,ordinality FROM jsonb_array_elements(b.workflow->'columns') WITH ORDINALITY LOOP
  SELECT s.id,coalesce(o.revision,1) INTO STRICT stage,order_rev FROM workflow_stages s
   LEFT JOIN project_status_order o ON o.project_id=s.project_id AND o.status=s.legacy_status
   WHERE s.project_id=b.project_id AND s.legacy_status=item.value->>'status';
  lim:=CASE WHEN item.value->>'warningLimit' IS NOT NULL THEN nullif((item.value->>'warningLimit')::integer,0)
       WHEN split_part(item.value->>'status',':',1)='in_progress' THEN b.in_progress_limit
       WHEN split_part(item.value->>'status',':',1)='review' THEN b.review_limit END;
  INSERT INTO board_columns(id,project_id,board_id,name,position,wip_limit,wip_mode,order_revision,legacy_status,legacy_backfill_pending)
   VALUES(gen_random_uuid(),b.project_id,b.id,item.value->>'name',item.ordinality,lim,'warn',order_rev,item.value->>'status',true)
   ON CONFLICT(board_id,legacy_status) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,
    wip_limit=EXCLUDED.wip_limit,wip_mode='warn',order_revision=EXCLUDED.order_revision RETURNING id INTO col;
  INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) VALUES(b.project_id,b.id,col,stage)
   ON CONFLICT(board_id,stage_id) DO UPDATE SET column_id=EXCLUDED.column_id;

 END LOOP;
 DELETE FROM board_columns c WHERE c.board_id=b.id AND c.legacy_status IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.workflow->'columns') v WHERE v->>'status'=c.legacy_status);
END;
$$;
CREATE FUNCTION sync_legacy_board_layout(p_board uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM boards b JOIN projects p ON p.id=b.project_id WHERE b.id=p_board AND p.core_mode='legacy') THEN
  PERFORM prepare_legacy_board_layout(p_board);
 END IF;
END;
$$;
CREATE FUNCTION backfill_legacy_board_layout(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE target uuid;board record;affected integer:=0;
BEGIN
 IF p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION 'layout batch must be 1-25';END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 SELECT b.project_id INTO target FROM boards b WHERE NOT EXISTS(SELECT 1 FROM board_columns c WHERE c.board_id=b.id) ORDER BY b.project_id LIMIT 1;
 IF target IS NULL THEN RETURN 0;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||target::text,0));
 PERFORM id FROM projects WHERE id=target FOR UPDATE;
 FOR board IN SELECT b.id FROM boards b WHERE b.project_id=target AND NOT EXISTS(SELECT 1 FROM board_columns c WHERE c.board_id=b.id) ORDER BY b.id LIMIT p_limit FOR UPDATE LOOP
  PERFORM prepare_legacy_board_layout(board.id);affected:=affected+1;
 END LOOP;
 RETURN greatest(affected,1); -- Recheck if a concurrent legacy save filled this project.
END;
$$;
CREATE FUNCTION backfill_legacy_board_ranks(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE target uuid;affected integer;completed integer;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'rank batch must be 1-1000';END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 SELECT project_id INTO target FROM board_columns WHERE legacy_backfill_pending ORDER BY project_id LIMIT 1;
 IF target IS NULL THEN RETURN 0;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||target::text,0));
 PERFORM id FROM projects WHERE id=target FOR UPDATE;
 INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank)
 SELECT i.project_id,m.board_id,m.column_id,i.id,i.rank FROM board_columns c
 JOIN board_column_stages m ON m.column_id=c.id JOIN issues i ON i.project_id=m.project_id AND i.stage_id=m.stage_id
 WHERE c.project_id=target AND c.legacy_backfill_pending
 AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=m.board_id AND r.issue_id=i.id)
 ORDER BY m.board_id,i.id LIMIT p_limit ON CONFLICT(board_id,issue_id) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 UPDATE board_columns c SET legacy_backfill_pending=false WHERE c.project_id=target AND c.legacy_backfill_pending
 AND NOT EXISTS(SELECT 1 FROM board_column_stages m JOIN issues i ON i.project_id=m.project_id AND i.stage_id=m.stage_id
  WHERE m.column_id=c.id AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=m.board_id AND r.issue_id=i.id));
 GET DIAGNOSTICS completed=ROW_COUNT;
 RETURN greatest(affected,completed,1);
END;
$$;
CREATE FUNCTION bridge_legacy_board_layout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM sync_legacy_board_layout(NEW.id);RETURN NEW;END;
$$;
CREATE FUNCTION bridge_legacy_board_rank() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.rank IS NOT DISTINCT FROM OLD.rank THEN RETURN NEW;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='legacy') THEN RETURN NEW;END IF;
 INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank)
  SELECT NEW.project_id,m.board_id,m.column_id,NEW.id,NEW.rank FROM board_column_stages m
  WHERE m.project_id=NEW.project_id AND m.stage_id=NEW.stage_id
  ON CONFLICT(board_id,issue_id) DO UPDATE SET column_id=EXCLUDED.column_id,rank=EXCLUDED.rank;
 RETURN NEW;
END;
$$;
CREATE FUNCTION bridge_legacy_board_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revision IS DISTINCT FROM OLD.revision AND EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND core_mode='legacy') THEN
  UPDATE board_columns SET order_revision=NEW.revision WHERE project_id=NEW.project_id AND legacy_status=NEW.status;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION advance_native_board_stage_order() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE FUNCTION preserve_board_column_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.board_id IS DISTINCT FROM OLD.board_id THEN
  RAISE EXCEPTION 'board column ownership is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER boards_layout_bridge AFTER INSERT OR UPDATE OF workflow,in_progress_limit,review_limit ON boards FOR EACH ROW EXECUTE FUNCTION bridge_legacy_board_layout();
CREATE TRIGGER issues_board_rank_bridge AFTER INSERT OR UPDATE OF status,rank ON issues FOR EACH ROW EXECUTE FUNCTION bridge_legacy_board_rank();
CREATE TRIGGER status_board_order_bridge AFTER UPDATE OF revision ON project_status_order FOR EACH ROW EXECUTE FUNCTION bridge_legacy_board_order();
CREATE TRIGGER issues_native_board_stage_order AFTER INSERT OR UPDATE OF stage_id ON issues FOR EACH ROW EXECUTE FUNCTION advance_native_board_stage_order();
CREATE TRIGGER board_columns_identity BEFORE UPDATE ON board_columns FOR EACH ROW EXECUTE FUNCTION preserve_board_column_identity();
REVOKE ALL ON FUNCTION prepare_legacy_board_layout(uuid),backfill_legacy_board_layout(integer),backfill_legacy_board_ranks(integer),sync_legacy_board_layout(uuid) FROM PUBLIC;

CREATE INDEX issues_board_stage_page ON issues(project_id,stage_id,created_at,id) WHERE NOT archived AND NOT backlog;
CREATE INDEX issues_board_unranked_page ON issues(project_id,created_at,id) WHERE NOT archived AND NOT backlog;

-- +goose Down
DROP INDEX issues_board_unranked_page;
DROP INDEX issues_board_stage_page;
DROP TRIGGER issues_native_board_stage_order ON issues;
DROP FUNCTION advance_native_board_stage_order();
DROP TRIGGER board_columns_identity ON board_columns;
DROP TRIGGER status_board_order_bridge ON project_status_order;
DROP TRIGGER issues_board_rank_bridge ON issues;
DROP TRIGGER boards_layout_bridge ON boards;
DROP FUNCTION preserve_board_column_identity();
DROP FUNCTION bridge_legacy_board_order();
DROP FUNCTION bridge_legacy_board_rank();
DROP FUNCTION bridge_legacy_board_layout();
DROP FUNCTION backfill_legacy_board_ranks(integer);
DROP FUNCTION backfill_legacy_board_layout(integer);
DROP FUNCTION sync_legacy_board_layout(uuid);
DROP FUNCTION prepare_legacy_board_layout(uuid);
DROP TABLE board_issue_ranks,board_column_stages,board_columns;
