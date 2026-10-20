-- +goose Up
CREATE TABLE planning_items (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id),
 kind text NOT NULL CHECK(kind IN ('epic','release')),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
 target_date date, status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','complete')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,id)
);
CREATE INDEX planning_project_page ON planning_items(project_id,kind,name COLLATE "C",id);
CREATE TABLE planning_issue (
 issue_id uuid PRIMARY KEY, project_id uuid NOT NULL, epic_id uuid, release_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 FOREIGN KEY(project_id,issue_id) REFERENCES issues(project_id,id),
 FOREIGN KEY(project_id,epic_id) REFERENCES planning_items(project_id,id),
 FOREIGN KEY(project_id,release_id) REFERENCES planning_items(project_id,id)
);
CREATE INDEX planning_epic_progress ON planning_issue(epic_id,issue_id) WHERE epic_id IS NOT NULL;
CREATE INDEX planning_release_progress ON planning_issue(release_id,issue_id) WHERE release_id IS NOT NULL;
CREATE INDEX activity_issue_transitions ON activity_events(project_id,issue_id,created_at,id) WHERE resource_kind='issue';
-- Category prefixes are persisted in event values, so renaming or retiring a stage does not rewrite timing history.
CREATE VIEW planning_status_events AS
SELECT e.id,e.issue_id,e.project_id,e.created_at,
 split_part(f->>'before',':',1) AS before_category,split_part(f->>'after',':',1) AS after_category
FROM activity_events e CROSS JOIN LATERAL jsonb_array_elements(e.changes->'fields') f
WHERE e.resource_kind='issue' AND e.issue_id IS NOT NULL AND f->>'field'='status' AND f->>'after' IS NOT NULL;
CREATE VIEW planning_completion_cycles AS
WITH episodes AS (
 SELECT s.*,
 coalesce(sum(CASE WHEN after_category='done' AND before_category IS DISTINCT FROM 'done' THEN 1 ELSE 0 END)
 OVER(PARTITION BY project_id,issue_id ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS episode
 FROM planning_status_events s
), timed AS (
 SELECT e.*,
 min(CASE WHEN after_category IN ('in_progress','review') OR (before_category='done' AND after_category<>'done') THEN created_at END)
 OVER(PARTITION BY project_id,issue_id,episode) AS started_at
 FROM episodes e
)
SELECT id,issue_id,project_id,created_at AS completed_at,started_at FROM timed
WHERE after_category='done' AND before_category IS DISTINCT FROM 'done';
-- +goose Down
DROP VIEW planning_completion_cycles;
DROP VIEW planning_status_events;
DROP INDEX activity_issue_transitions;
DROP TABLE planning_issue;
DROP TABLE planning_items;
