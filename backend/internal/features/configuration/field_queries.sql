-- name: ConfigurationFields :many
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id
FROM field_definitions WHERE project_id=sqlc.arg(project_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired)
AND (NOT sqlc.arg(has_cursor)::boolean OR id>sqlc.arg(after_id)::uuid) ORDER BY id LIMIT sqlc.arg(page_size)::integer;

-- name: ConfigurationFieldCount :one
SELECT count(*) FROM field_definitions WHERE project_id=$1 AND ($2::boolean OR NOT retired);

-- name: ConfigurationField :one
SELECT id,project_id,key,name,value_kind,required,retired,default_text,coalesce(default_number::text,'')::text AS default_number_text,default_date,default_option_id,default_user_id FROM field_definitions WHERE project_id=$1 AND id=$2;

-- name: ConfigurationSaveField :one
INSERT INTO field_definitions(id,project_id,key,name,value_kind,required,retired,default_text,default_number,default_date,default_option_id,default_user_id)
VALUES(sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(key),sqlc.arg(name),sqlc.arg(value_kind),sqlc.arg(required),sqlc.arg(retired),sqlc.narg(default_text),sqlc.narg(default_number)::text::numeric,sqlc.narg(default_date),sqlc.narg(default_option_id),sqlc.narg(default_user_id))
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,value_kind=EXCLUDED.value_kind,required=EXCLUDED.required,retired=EXCLUDED.retired,default_text=EXCLUDED.default_text,default_number=EXCLUDED.default_number,default_date=EXCLUDED.default_date,default_option_id=EXCLUDED.default_option_id,default_user_id=EXCLUDED.default_user_id
WHERE field_definitions.project_id=EXCLUDED.project_id AND field_definitions.key=EXCLUDED.key RETURNING id;

-- name: ConfigurationFieldUsed :one
SELECT (EXISTS(SELECT 1 FROM issue_field_values v WHERE v.field_id=$1) OR EXISTS(SELECT 1 FROM field_options o WHERE o.field_id=$1) OR EXISTS(SELECT 1 FROM transition_required_fields r WHERE r.field_id=$1))::boolean AS used;

-- name: ConfigurationFieldHasMissing :one
SELECT EXISTS(SELECT 1 FROM issues i WHERE i.project_id=$1 AND NOT EXISTS(SELECT 1 FROM issue_field_values v WHERE v.issue_id=i.id AND v.field_id=$2 AND (v.value_kind<>'text' OR char_length(btrim(v.text_value))>0)))::boolean AS missing;

-- name: ConfigurationFieldRequiredByTransition :one
SELECT EXISTS(SELECT 1 FROM transition_required_fields required JOIN workflow_transitions t ON t.id=required.transition_id WHERE required.project_id=$1 AND required.field_id=$2 AND NOT t.retired)::boolean AS required;

-- name: ConfigurationFieldOptions :many
SELECT * FROM field_options WHERE project_id=sqlc.arg(project_id) AND field_id=sqlc.arg(field_id) AND (sqlc.arg(include_retired)::boolean OR NOT retired)
AND (NOT sqlc.arg(has_cursor)::boolean OR (position,id)>(sqlc.arg(after_position)::bigint,sqlc.arg(after_id)::uuid)) ORDER BY position,id LIMIT sqlc.arg(page_size)::integer;

-- name: ConfigurationFieldOptionCount :one
SELECT count(*) FROM field_options WHERE project_id=$1 AND field_id=$2 AND ($3::boolean OR NOT retired);

-- name: ConfigurationFieldOption :one
SELECT * FROM field_options WHERE project_id=$1 AND field_id=$2 AND id=$3;

-- name: ConfigurationSaveFieldOption :one
INSERT INTO field_options(id,project_id,field_id,name,position,retired) VALUES($1,$2,$3,$4,$5,$6)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,retired=EXCLUDED.retired WHERE field_options.project_id=EXCLUDED.project_id AND field_options.field_id=EXCLUDED.field_id RETURNING id;

-- name: ConfigurationFieldUserEligible :one
SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships membership WHERE membership.project_id=$2 AND membership.user_id=u.id AND membership.removed_at IS NULL AND membership.role IN('member','project_admin','viewer'))))::boolean AS eligible;

-- name: ConfigurationTransitionPolicy :one
SELECT * FROM workflow_transitions WHERE project_id=$1 AND workflow_id=$2 AND id=$3;

-- name: ConfigurationPolicyRequirements :many
SELECT system_field,field_id FROM transition_required_fields WHERE transition_id=$1 ORDER BY system_field,field_id;

-- name: ConfigurationSavePolicy :exec
UPDATE workflow_transitions SET approvals_required=$2,approver_role=$3,exclude_issue_reporter=$4 WHERE id=$1;

-- name: ConfigurationClearPolicyRequirements :exec
DELETE FROM transition_required_fields WHERE transition_id=$1;

-- name: ConfigurationInsertPolicyRequirement :exec
INSERT INTO transition_required_fields(id,project_id,workflow_id,transition_id,system_field,field_id) VALUES($1,$2,$3,$4,$5,$6);
