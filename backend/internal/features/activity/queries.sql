-- name: ReadActivityEvent :one
SELECT * FROM activity_events WHERE id = $1;

-- name: AppendActivityEvent :one
INSERT INTO activity_events (id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes)
VALUES ($1,$2,$3,$4,$5,$6,sqlc.narg(project_id),sqlc.narg(issue_id),$7)
RETURNING *;

-- name: ActivityCount :one
WITH requested_issue AS (
 SELECT split_part(upper(sqlc.narg(issue_key)::text),'-',1) AS project_key,
        substring(sqlc.narg(issue_key)::text FROM '-([1-9][0-9]*)$')::numeric AS issue_number
), activity_issue_filter AS MATERIALIZED (
 SELECT filter_issue.id,filter_issue.project_id
 FROM requested_issue requested
 JOIN projects filter_project ON filter_project.key=requested.project_key
 JOIN issues filter_issue ON filter_issue.project_id=filter_project.id
 WHERE filter_issue.number=(CASE WHEN requested.issue_number<=9223372036854775807 THEN requested.issue_number END)::bigint
)
SELECT count(*)::integer FROM activity_events e WHERE true
AND (sqlc.narg(from_date)::date IS NULL OR (e.created_at AT TIME ZONE (SELECT time_zone FROM company_settings WHERE singleton))::date>=sqlc.narg(from_date)::date)
AND (sqlc.narg(to_date)::date IS NULL OR (e.created_at AT TIME ZONE (SELECT time_zone FROM company_settings WHERE singleton))::date<=sqlc.narg(to_date)::date)
AND (sqlc.narg(issue_key)::text IS NULL OR EXISTS(SELECT 1 FROM activity_issue_filter filter_issue WHERE (e.issue_id=filter_issue.id OR (e.resource_kind='issue' AND e.resource_id=filter_issue.id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.'||filter_issue.id::text||'.%' OR f->>'field' LIKE 'issues.'||filter_issue.project_id::text||'.'||filter_issue.id::text||'.%'))))
 AND (sqlc.narg(resource_kind)::text IS DISTINCT FROM 'issue' OR e.resource_kind <> 'notification')
AND (sqlc.narg(project_id)::uuid IS NULL OR e.project_id = sqlc.narg(project_id) OR EXISTS (
 SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.' || sqlc.narg(project_id)::text || '.%'))
AND (sqlc.narg(resource_kind)::text IS NULL OR (e.resource_kind=sqlc.narg(resource_kind) AND e.resource_id=sqlc.narg(resource_id)) OR
 (sqlc.narg(resource_kind)='issue' AND (e.issue_id=sqlc.narg(resource_id) OR EXISTS (
 SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.' || sqlc.narg(resource_id)::text || '.%'
 OR f->>'field' ~ ('^issues\.[0-9a-f-]+\.' || sqlc.narg(resource_id)::text || '\.')))));

-- name: ActivityList :many
WITH requested_issue AS (
 SELECT split_part(upper(sqlc.narg(issue_key)::text),'-',1) AS project_key,
        substring(sqlc.narg(issue_key)::text FROM '-([1-9][0-9]*)$')::numeric AS issue_number
), activity_issue_filter AS MATERIALIZED (
 SELECT filter_issue.id,filter_issue.project_id
 FROM requested_issue requested
 JOIN projects filter_project ON filter_project.key=requested.project_key
 JOIN issues filter_issue ON filter_issue.project_id=filter_project.id
 WHERE filter_issue.number=(CASE WHEN requested.issue_number<=9223372036854775807 THEN requested.issue_number END)::bigint
), matched AS (
 SELECT e.*,u.display_name FROM activity_events e JOIN users u ON u.id=e.actor_id WHERE true
AND (sqlc.narg(from_date)::date IS NULL OR (e.created_at AT TIME ZONE (SELECT time_zone FROM company_settings WHERE singleton))::date>=sqlc.narg(from_date)::date)
AND (sqlc.narg(to_date)::date IS NULL OR (e.created_at AT TIME ZONE (SELECT time_zone FROM company_settings WHERE singleton))::date<=sqlc.narg(to_date)::date)
AND (sqlc.narg(issue_key)::text IS NULL OR EXISTS(SELECT 1 FROM activity_issue_filter filter_issue WHERE (e.issue_id=filter_issue.id OR (e.resource_kind='issue' AND e.resource_id=filter_issue.id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.'||filter_issue.id::text||'.%' OR f->>'field' LIKE 'issues.'||filter_issue.project_id::text||'.'||filter_issue.id::text||'.%'))))
 AND (sqlc.narg(resource_kind)::text IS DISTINCT FROM 'issue' OR e.resource_kind <> 'notification')
AND (sqlc.narg(project_id)::uuid IS NULL OR e.project_id = sqlc.narg(project_id) OR EXISTS (
 SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.' || sqlc.narg(project_id)::text || '.%'))
AND (sqlc.narg(resource_kind)::text IS NULL OR (e.resource_kind=sqlc.narg(resource_kind) AND e.resource_id=sqlc.narg(resource_id)) OR
 (sqlc.narg(resource_kind)='issue' AND (e.issue_id=sqlc.narg(resource_id) OR EXISTS (
 SELECT 1 FROM jsonb_array_elements(e.changes->'fields') f WHERE f->>'field' LIKE 'issues.' || sqlc.narg(resource_id)::text || '.%'
 OR f->>'field' ~ ('^issues\.[0-9a-f-]+\.' || sqlc.narg(resource_id)::text || '\.')))))
 AND (NOT sqlc.arg(has_cursor)::boolean OR (e.created_at,e.id)<(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
 ORDER BY e.created_at DESC,e.id DESC LIMIT sqlc.arg(page_size)
)
SELECT e.id,e.actor_id,e.display_name,e.action,e.channel,e.resource_kind,e.resource_id,e.project_id,e.issue_id,e.created_at,
 coalesce(CASE WHEN linked_issue.id IS NOT NULL THEN linked_project.key||'-'||linked_issue.number::text ELSE NULL END,'')::text AS issue_key,
 coalesce(linked_project.name,'')::text AS project_name,
 coalesce(linked_issue.title,resource_board.name,resource_project.name,resource_user.display_name,e.resource_kind)::text AS resource_name,
 jsonb_build_object('version',1,'abbreviated',coalesce(p.abbreviated,false),'fields',coalesce(p.fields,'[]'::jsonb))::jsonb AS public_changes
FROM matched e
LEFT JOIN issues linked_issue ON linked_issue.id=coalesce(e.issue_id,CASE WHEN e.resource_kind='issue' THEN e.resource_id ELSE NULL END)
LEFT JOIN projects linked_project ON linked_project.id=coalesce(e.project_id,linked_issue.project_id)
LEFT JOIN boards resource_board ON e.resource_kind='board' AND resource_board.id=e.resource_id
LEFT JOIN projects resource_project ON e.resource_kind='project' AND resource_project.id=e.resource_id
LEFT JOIN users resource_user ON e.resource_kind='user' AND resource_user.id=e.resource_id
LEFT JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('field',field,'before',before_value,'after',after_value) ORDER BY ordinal) FILTER (WHERE ordinal<=50) AS fields,
 coalesce(bool_or(ordinal>50 OR is_long),false)::boolean AS abbreviated
 FROM (
 SELECT f->>'field' AS field,
 CASE WHEN f->>'before' IS NULL THEN NULL ELSE left(f->>'before',1024) || CASE WHEN length(f->>'before')>1024 THEN '…' ELSE '' END END AS before_value,
 CASE WHEN f->>'after' IS NULL THEN NULL ELSE left(f->>'after',1024) || CASE WHEN length(f->>'after')>1024 THEN '…' ELSE '' END END AS after_value,
 length(coalesce(f->>'before',''))>1024 OR length(coalesce(f->>'after',''))>1024 AS is_long,
 row_number() OVER (ORDER BY ord) AS ordinal
 FROM jsonb_array_elements(e.changes->'fields') WITH ORDINALITY source(f,ord)
 WHERE (sqlc.narg(resource_kind)::text IS NULL OR (e.resource_kind=sqlc.narg(resource_kind) AND e.resource_id=sqlc.narg(resource_id)) OR (sqlc.narg(resource_kind)='issue' AND e.issue_id=sqlc.narg(resource_id))
 OR (sqlc.narg(resource_kind)='issue' AND (f->>'field' LIKE 'issues.' || sqlc.narg(resource_id)::text || '.%'
 OR f->>'field' ~ ('^issues\.[0-9a-f-]+\.' || sqlc.narg(resource_id)::text || '\.'))))
 AND (sqlc.narg(project_id)::uuid IS NULL OR e.project_id=sqlc.narg(project_id) OR f->>'field' LIKE 'issues.' || sqlc.narg(project_id)::text || '.%')
 ) bounded
) p ON true
ORDER BY e.created_at DESC,e.id DESC;
