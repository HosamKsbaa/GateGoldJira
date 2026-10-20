-- +goose Up
-- The owner backfill joins the same protocol before its legacy project lock.
-- No storage or business outcome changes; completed projects need no backfill.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION backfill_legacy_issue_configuration(p_limit integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE selected_project uuid; affected integer;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'backfill batch must be 1-1000'; END IF;
 PERFORM singleton FROM company_settings WHERE singleton FOR SHARE;
 LOOP
  SELECT p.id INTO selected_project FROM projects p
  WHERE EXISTS(SELECT 1 FROM issues i WHERE i.project_id=p.id AND i.type_id IS NULL)
  ORDER BY p.id LIMIT 1;
  IF selected_project IS NULL THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||selected_project::text,0));
  PERFORM id FROM projects WHERE id=selected_project FOR UPDATE;
  EXIT WHEN EXISTS(SELECT 1 FROM issues WHERE project_id=selected_project AND type_id IS NULL);
 END LOOP;
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
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Project lifecycle participation must be retained while metadata writers are deployed'; END $$;
-- +goose StatementEnd
