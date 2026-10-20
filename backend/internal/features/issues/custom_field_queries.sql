-- name: IssuesFieldDefinitions :many
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id
FROM field_definitions WHERE project_id=sqlc.arg(project_id) AND (NOT sqlc.arg(has_cursor)::boolean OR id>sqlc.arg(after_id)::uuid) ORDER BY id LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesActiveFieldDefinitions :many
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id FROM field_definitions WHERE project_id=$1 AND NOT retired ORDER BY id LIMIT 101;

-- name: IssuesFieldDefinition :one
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id FROM field_definitions WHERE project_id=$1 AND id=$2;

-- name: IssuesCustomValues :many
SELECT field_id,value_kind,text_value,coalesce(number_value::text,'')::text AS number_text,date_value,option_id,user_id
FROM issue_field_values WHERE issue_id=$1 AND field_id=ANY(sqlc.arg(field_ids)::uuid[]) ORDER BY field_id;

-- name: IssuesPutCustomValue :exec
INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,text_value,number_value,date_value,option_id,user_id)
VALUES(sqlc.arg(project_id),sqlc.arg(issue_id),sqlc.arg(field_id),sqlc.arg(value_kind),sqlc.narg(text_value),sqlc.narg(number_value)::text::numeric,sqlc.narg(date_value),sqlc.narg(option_id),sqlc.narg(user_id))
ON CONFLICT(issue_id,field_id) DO UPDATE SET value_kind=EXCLUDED.value_kind,text_value=EXCLUDED.text_value,number_value=EXCLUDED.number_value,date_value=EXCLUDED.date_value,option_id=EXCLUDED.option_id,user_id=EXCLUDED.user_id;

-- name: IssuesClearCustomValue :exec
DELETE FROM issue_field_values WHERE issue_id=$1 AND field_id=$2;

-- name: IssuesCustomValueRevision :exec
UPDATE issues SET revision=revision+1,updated_at=now() WHERE id=$1;

-- name: IssuesMissingRequiredFields :many
SELECT f.id,f.name FROM field_definitions f WHERE f.project_id=$1 AND f.required AND NOT f.retired
AND NOT EXISTS(SELECT 1 FROM issue_field_values v WHERE v.issue_id=$2 AND v.field_id=f.id AND (v.value_kind<>'text' OR char_length(btrim(v.text_value))>0)) ORDER BY f.id LIMIT 101;

-- name: IssuesCustomFieldOption :one
SELECT * FROM field_options WHERE project_id=$1 AND field_id=$2 AND id=$3;

-- name: IssuesCustomFieldUserEligible :one
SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships membership WHERE membership.project_id=$2 AND membership.user_id=u.id AND membership.removed_at IS NULL AND membership.role IN('member','project_admin','viewer'))))::boolean AS eligible;

-- name: IssuesCreateFieldDefinitions :many
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id
FROM field_definitions WHERE project_id=$1 AND NOT retired AND id>sqlc.arg(after_id)::uuid ORDER BY id LIMIT 101;

-- name: IssuesFieldDefaultBatch :many
SELECT i.id FROM issues i WHERE i.project_id=$1 AND NOT EXISTS(SELECT 1 FROM issue_field_values value WHERE value.issue_id=i.id AND value.field_id=$2)
ORDER BY i.id LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesFieldDefaultRemaining :one
SELECT count(*) FROM issues i WHERE i.project_id=$1 AND NOT EXISTS(SELECT 1 FROM issue_field_values value WHERE value.issue_id=i.id AND value.field_id=$2);

-- name: IssuesCustomValueDisplays :many
SELECT v.field_id,coalesce(v.option_id,v.user_id,'00000000-0000-0000-0000-000000000000'::uuid)::uuid AS reference_id,
coalesce(o.name,u.display_name,'')::text AS label,coalesce(o.retired,false)::boolean AS retired
FROM issue_field_values v
LEFT JOIN field_options o ON o.project_id=v.project_id AND o.field_id=v.field_id AND o.id=v.option_id
LEFT JOIN users u ON u.id=v.user_id
WHERE v.issue_id=sqlc.arg(issue_id) AND v.field_id=ANY(sqlc.arg(field_ids)::uuid[])
AND ((v.value_kind='choice' AND o.id IS NOT NULL) OR (v.value_kind='user' AND u.id IS NOT NULL))
ORDER BY v.field_id;
