-- Design probe only. All tables/functions are session-local; the transaction rolls back.
-- Uses the existing pg_trgm extension. No application tables are read or changed.
-- Run with psql -X -qAt -v ON_ERROR_STOP=1 against a local PostgreSQL 18 test server.
-- Not an application, concurrency, cold-cache, cloud, or full-schema benchmark.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_temp, public;
CREATE FUNCTION pg_temp.probe_id(text) RETURNS uuid LANGUAGE sql IMMUTABLE STRICT
AS 'SELECT md5($1)::uuid';
CREATE TEMP TABLE probe_projects(id uuid PRIMARY KEY);
CREATE TEMP TABLE probe_types(project_id uuid NOT NULL REFERENCES probe_projects,
  id uuid NOT NULL, PRIMARY KEY(project_id,id));
CREATE TEMP TABLE probe_workflows(project_id uuid NOT NULL REFERENCES probe_projects,
  id uuid NOT NULL, PRIMARY KEY(project_id,id));
CREATE TEMP TABLE probe_bindings(project_id uuid NOT NULL, type_id uuid NOT NULL,
  workflow_id uuid NOT NULL, is_default boolean NOT NULL, accepts_new boolean NOT NULL,
  PRIMARY KEY(project_id,type_id,workflow_id), CHECK(NOT is_default OR accepts_new),
  FOREIGN KEY(project_id,type_id) REFERENCES probe_types,
  FOREIGN KEY(project_id,workflow_id) REFERENCES probe_workflows);
CREATE UNIQUE INDEX probe_one_default ON probe_bindings(project_id,type_id) WHERE is_default;
CREATE TEMP TABLE probe_stages(project_id uuid NOT NULL, workflow_id uuid NOT NULL,
  id uuid NOT NULL, PRIMARY KEY(project_id,workflow_id,id),
  FOREIGN KEY(project_id,workflow_id) REFERENCES probe_workflows);
CREATE TEMP TABLE probe_issues(id uuid PRIMARY KEY, project_id uuid NOT NULL,
  number bigint NOT NULL, type_id uuid NOT NULL, workflow_id uuid NOT NULL,
  stage_id uuid NOT NULL, title text NOT NULL, archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL, UNIQUE(project_id,number), UNIQUE(project_id,id),
  FOREIGN KEY(project_id,type_id,workflow_id) REFERENCES probe_bindings,
  FOREIGN KEY(project_id,workflow_id,stage_id) REFERENCES probe_stages);
INSERT INTO probe_projects SELECT pg_temp.probe_id('p'||g) FROM generate_series(1,2) g;
INSERT INTO probe_types SELECT id,pg_temp.probe_id('t'||g) FROM generate_series(1,2) g
 JOIN probe_projects ON id=pg_temp.probe_id('p'||g);
INSERT INTO probe_workflows SELECT pg_temp.probe_id('p'||g),pg_temp.probe_id('w'||g)
 FROM generate_series(1,2) g;
INSERT INTO probe_bindings SELECT pg_temp.probe_id('p'||g),pg_temp.probe_id('t'||g),
 pg_temp.probe_id('w'||g),true,true FROM generate_series(1,2) g;
INSERT INTO probe_stages SELECT pg_temp.probe_id('p'||g),pg_temp.probe_id('w'||g),
 pg_temp.probe_id('s'||g||':'||s) FROM generate_series(1,2) g CROSS JOIN generate_series(0,3) s;
INSERT INTO probe_issues
SELECT pg_temp.probe_id('i'||g),pg_temp.probe_id('p'||p),g,pg_temp.probe_id('t'||p),
 pg_temp.probe_id('w'||p),pg_temp.probe_id('s'||p||':'||(g%4)),
 CASE WHEN g%997=0 THEN 'needle speed ' WHEN g%5=0 THEN 'مراجعة الواجهة ' ELSE 'Implement feature ' END||g,
 false,timestamptz '2026-01-01 00:00:00+00'+g*interval '1 second'
FROM (SELECT g,CASE WHEN g<=90000 THEN 1 ELSE 2 END p FROM generate_series(1,100000) g) seed;
CREATE INDEX probe_issue_stage_page ON probe_issues(project_id,stage_id,created_at,id) WHERE NOT archived;
CREATE INDEX probe_issue_project_page ON probe_issues(project_id,created_at,id) WHERE NOT archived;
CREATE INDEX probe_title_trgm ON probe_issues USING gin(title gin_trgm_ops);
CREATE TEMP TABLE probe_ranks(board_id uuid NOT NULL,column_id uuid NOT NULL,
 issue_id uuid NOT NULL REFERENCES probe_issues,rank bigint NOT NULL,PRIMARY KEY(board_id,issue_id));
INSERT INTO probe_ranks SELECT pg_temp.probe_id('board1'),pg_temp.probe_id('column1'),id,number*1024
 FROM probe_issues WHERE number<=90000 AND number%4 IN (0,1) AND number%3<>0;
CREATE INDEX probe_rank_page ON probe_ranks(board_id,column_id,rank,issue_id);
CREATE TEMP TABLE probe_fields(project_id uuid NOT NULL REFERENCES probe_projects,id uuid NOT NULL,
 value_kind text NOT NULL CHECK(value_kind IN ('text','number')),PRIMARY KEY(project_id,id,value_kind));
INSERT INTO probe_fields VALUES(pg_temp.probe_id('p1'),pg_temp.probe_id('field1'),'number');
CREATE TEMP TABLE probe_values(project_id uuid NOT NULL,issue_id uuid NOT NULL,field_id uuid NOT NULL,
 value_kind text NOT NULL,text_value text,number_value numeric,
 PRIMARY KEY(issue_id,field_id),FOREIGN KEY(project_id,issue_id) REFERENCES probe_issues(project_id,id),
 FOREIGN KEY(project_id,field_id,value_kind) REFERENCES probe_fields,
 CHECK((value_kind='text' AND text_value IS NOT NULL AND number_value IS NULL)
    OR (value_kind='number' AND number_value IS NOT NULL AND text_value IS NULL)));
INSERT INTO probe_values SELECT project_id,id,pg_temp.probe_id('field1'),'number',NULL,number%1000
 FROM probe_issues WHERE project_id=pg_temp.probe_id('p1');
CREATE INDEX probe_number_filter ON probe_values(project_id,field_id,number_value,issue_id)
 WHERE value_kind='number';

-- Verify an additional default can replace the first without rewriting old issues.
INSERT INTO probe_workflows VALUES(pg_temp.probe_id('p1'),pg_temp.probe_id('w-new'));
UPDATE probe_bindings SET is_default=false WHERE project_id=pg_temp.probe_id('p1');
INSERT INTO probe_bindings VALUES(pg_temp.probe_id('p1'),pg_temp.probe_id('t1'),pg_temp.probe_id('w-new'),true,true);
DO $$ BEGIN
 IF (SELECT count(*) FROM probe_issues WHERE workflow_id=pg_temp.probe_id('w1'))<>90000
 THEN RAISE EXCEPTION 'Default change rewrote or invalidated old issues'; END IF;
 BEGIN
   UPDATE probe_bindings SET is_default=true WHERE workflow_id=pg_temp.probe_id('w1');
   RAISE EXCEPTION 'Duplicate default was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
   UPDATE probe_issues SET workflow_id=pg_temp.probe_id('w2') WHERE number=1;
   RAISE EXCEPTION 'Cross-project workflow was accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   UPDATE probe_issues SET workflow_id=pg_temp.probe_id('w-new') WHERE number=1;
   RAISE EXCEPTION 'Stage in wrong workflow was accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   UPDATE probe_values SET number_value=NULL WHERE issue_id=pg_temp.probe_id('i1');
   RAISE EXCEPTION 'Null typed value was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE probe_values SET value_kind='text',text_value='x',number_value=NULL WHERE issue_id=pg_temp.probe_id('i1');
   RAISE EXCEPTION 'Wrong field kind was accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
ANALYZE probe_issues;
ANALYZE probe_ranks;
ANALYZE probe_values;
CREATE FUNCTION pg_temp.probe_query(label text, statement text, trials integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE plan jsonb; samples double precision[] := '{}'; p50 double precision; p95 double precision;
BEGIN
 FOR i IN 1..trials+3 LOOP
   EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '||statement INTO plan;
   IF i>3 THEN samples:=array_append(samples,(plan->0->>'Execution Time')::double precision); END IF;
 END LOOP;
 SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY s),percentile_cont(0.95) WITHIN GROUP(ORDER BY s)
 INTO p50,p95 FROM unnest(samples) s;
 RETURN jsonb_build_object('name',label,'trials',trials,'p50Ms',p50,'p95Ms',p95,'lastPlan',plan->0);
END $$;
SELECT jsonb_build_object('environment','local PostgreSQL, temporary synthetic tables, warm sequential SQL only',
 'postgresVersion',current_setting('server_version'),'generatedAt',clock_timestamp(),'issues',100000,
 'hotProjectIssues',90000,'customFieldValues',90000,'constraintsPassed',5,'defaultSwitchPreservedIssues',90000,
 'cloudAcceptance',false,'applicationAcceptance',false);
SELECT pg_temp.probe_query('number-cast-predicate',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND number::text='79999' LIMIT 25$q$);
SELECT pg_temp.probe_query('number-index-predicate',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND number=79999 LIMIT 25$q$);
SELECT pg_temp.probe_query('title-strpos-predicate',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND strpos(lower(title),'needle speed')>0 ORDER BY id LIMIT 25$q$);
SELECT pg_temp.probe_query('title-trigram-predicate',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND title ILIKE '%needle speed%' ORDER BY id LIMIT 25$q$);
SELECT pg_temp.probe_query('arabic-trigram-predicate',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND title ILIKE '%مراجعة الواجهة%' ORDER BY id LIMIT 25$q$);
SELECT pg_temp.probe_query('numeric-custom-field',$q$SELECT i.id,v.number_value FROM probe_values v
 JOIN probe_issues i ON i.project_id=v.project_id AND i.id=v.issue_id
 WHERE v.project_id=pg_temp.probe_id('p1') AND v.field_id=pg_temp.probe_id('field1')
 AND v.value_kind='number' AND v.number_value BETWEEN 250 AND 255 AND NOT i.archived
 ORDER BY v.number_value,v.issue_id LIMIT 25$q$);
CREATE FUNCTION pg_temp.board_page_query() RETURNS text LANGUAGE sql AS $$ SELECT $q$
 SELECT * FROM (
 (SELECT i.id,0 AS bucket,r.rank AS sort_rank,i.created_at FROM probe_ranks r
 JOIN probe_issues i ON i.id=r.issue_id
 WHERE r.board_id=pg_temp.probe_id('board1') AND r.column_id=pg_temp.probe_id('column1')
 AND i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 ORDER BY r.rank,r.issue_id LIMIT 25)
 UNION ALL
 (SELECT i.id,1 AS bucket,NULL::bigint AS sort_rank,i.created_at FROM probe_issues i
 WHERE i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 AND NOT EXISTS(SELECT 1 FROM probe_ranks r WHERE r.board_id=pg_temp.probe_id('board1')
 AND r.column_id=pg_temp.probe_id('column1') AND r.issue_id=i.id)
 ORDER BY i.created_at,i.id LIMIT 25)
 ) candidates ORDER BY bucket,sort_rank NULLS LAST,
 CASE WHEN bucket=1 THEN created_at END,id LIMIT 25$q$ $$;
SELECT pg_temp.probe_query('board-ranked-and-unranked',pg_temp.board_page_query());
INSERT INTO probe_ranks SELECT pg_temp.probe_id('board1'),pg_temp.probe_id('column1'),id,number*1024
 FROM probe_issues WHERE number<=90000 AND number%4 IN (0,1) ON CONFLICT DO NOTHING;
ANALYZE probe_ranks;
SELECT pg_temp.probe_query('board-all-ranked-unconditional-fallback',pg_temp.board_page_query());
SELECT pg_temp.probe_query('board-all-ranked-conditional-fallback',$q$
 WITH ranked AS MATERIALIZED (
 SELECT i.id,0 AS bucket,r.rank AS sort_rank,i.created_at FROM probe_ranks r
 JOIN probe_issues i ON i.id=r.issue_id
 WHERE r.board_id=pg_temp.probe_id('board1') AND r.column_id=pg_temp.probe_id('column1')
 AND i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 ORDER BY r.rank,r.issue_id LIMIT 25)
 SELECT * FROM (
 SELECT * FROM ranked
 UNION ALL
 (SELECT i.id,1 AS bucket,NULL::bigint AS sort_rank,i.created_at FROM probe_issues i
 WHERE (SELECT count(*) FROM ranked)<25
 AND i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 AND NOT EXISTS(SELECT 1 FROM probe_ranks r WHERE r.board_id=pg_temp.probe_id('board1')
 AND r.column_id=pg_temp.probe_id('column1') AND r.issue_id=i.id)
 ORDER BY i.created_at,i.id LIMIT 25)
 ) candidates ORDER BY bucket,sort_rank NULLS LAST,
 CASE WHEN bucket=1 THEN created_at END,id LIMIT 25$q$);
SELECT pg_temp.probe_query('absent-single-arabic-character',$q$SELECT id FROM probe_issues
 WHERE project_id=pg_temp.probe_id('p1') AND title ILIKE '%ظ%' LIMIT 25$q$);

-- Refinement: an active-only query must expose its partial-index predicate even
-- when prepared. These are SQL plan probes, not the actual pgx execution path.
PREPARE probe_page_parameterized(uuid,uuid[],boolean) AS SELECT id FROM probe_issues
 WHERE project_id=$1 AND stage_id=ANY($2) AND archived=$3
 ORDER BY created_at,id LIMIT 25;
PREPARE probe_page_active(uuid,uuid[]) AS SELECT id FROM probe_issues
 WHERE project_id=$1 AND stage_id=ANY($2) AND NOT archived
 ORDER BY created_at,id LIMIT 25;
SET LOCAL plan_cache_mode = force_generic_plan;
SELECT pg_temp.probe_query('prepared-generic-parameterized-archive',$q$EXECUTE probe_page_parameterized(
 pg_temp.probe_id('p1'),ARRAY[pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1')],false)$q$);
SELECT pg_temp.probe_query('prepared-generic-active-query',$q$EXECUTE probe_page_active(
 pg_temp.probe_id('p1'),ARRAY[pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1')])$q$);
SET LOCAL plan_cache_mode = force_custom_plan;
SELECT pg_temp.probe_query('prepared-custom-parameterized-archive',$q$EXECUTE probe_page_parameterized(
 pg_temp.probe_id('p1'),ARRAY[pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1')],false)$q$);
SET LOCAL plan_cache_mode = auto;
DEALLOCATE probe_page_parameterized;
DEALLOCATE probe_page_active;

-- Refinement: after ranked rows are exhausted, proving that no fallback card
-- exists can still be costly. Compare equivalent empty candidate sets.
SELECT pg_temp.probe_query('all-ranked-empty-fallback-anti-lookup',$q$SELECT i.id FROM probe_issues i
 WHERE i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 AND NOT EXISTS(SELECT 1 FROM probe_ranks r WHERE r.board_id=pg_temp.probe_id('board1')
 AND r.column_id=pg_temp.probe_id('column1') AND r.issue_id=i.id)
 ORDER BY i.created_at,i.id LIMIT 25$q$);
SELECT pg_temp.probe_query('all-ranked-empty-fallback-set-difference',$q$
 WITH remaining AS (
 SELECT i.id FROM probe_issues i
 WHERE i.project_id=pg_temp.probe_id('p1') AND NOT i.archived
 AND i.stage_id IN (pg_temp.probe_id('s1:0'),pg_temp.probe_id('s1:1'))
 EXCEPT
 SELECT r.issue_id FROM probe_ranks r WHERE r.board_id=pg_temp.probe_id('board1')
 AND r.column_id=pg_temp.probe_id('column1'))
 SELECT i.id FROM remaining JOIN probe_issues i ON i.id=remaining.id
 ORDER BY i.created_at,i.id LIMIT 25$q$);
ROLLBACK;
