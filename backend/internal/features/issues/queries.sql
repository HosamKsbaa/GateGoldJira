-- name: ReadIssue :one
SELECT * FROM issues WHERE id = $1;

-- name: ReadStatusOrder :one
SELECT revision FROM project_status_order WHERE project_id = $1 AND status = $2;

-- name: IssuesAllocateNumber :one
UPDATE projects SET next_issue_number=next_issue_number+1 WHERE id=$1 RETURNING (next_issue_number-1)::bigint AS number;

-- name: IssuesInsert :one
INSERT INTO issues(id,project_id,number,title,description,description_format,type,priority,reporter_id,assignee_id,due_date,rank,status)
VALUES(sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(number),sqlc.arg(title),sqlc.arg(description),sqlc.arg(description_format),sqlc.arg(type),sqlc.arg(priority),sqlc.arg(reporter_id),sqlc.narg(assignee_id),sqlc.narg(due_date),sqlc.arg(rank),sqlc.arg(status)) RETURNING *;

-- name: IssuesUpdate :one
UPDATE issues SET title=sqlc.arg(title),description=sqlc.arg(description),description_format=sqlc.arg(description_format),type=sqlc.arg(type),priority=sqlc.arg(priority),assignee_id=sqlc.narg(assignee_id),due_date=sqlc.narg(due_date),revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id) RETURNING *;

-- name: IssuesAssigneeEligible :one
SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.user_id=u.id AND m.project_id=$2 AND m.removed_at IS NULL AND m.role IN('project_admin','member'))));

-- name: IssuesPatchAssignee :exec
UPDATE issues SET assignee_id=sqlc.narg(assignee_id),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id);

-- name: IssuesPatchPriority :exec
UPDATE issues SET priority=sqlc.arg(priority),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id);

-- name: IssuesPatchDueDate :exec
UPDATE issues SET due_date=sqlc.narg(due_date),revision=revision+1,updated_at=now() WHERE id=sqlc.arg(id);

-- name: IssuesLabelsEligible :one
SELECT count(*)::integer FROM labels WHERE project_id=$1 AND id=ANY($2::uuid[]);

-- name: IssuesClearLabels :exec
DELETE FROM issue_labels WHERE issue_id=$1;

-- name: IssuesSetLabels :exec
INSERT INTO issue_labels(project_id,issue_id,label_id) SELECT $1,$2,unnest($3::uuid[]);

-- name: IssuesOrders :many
SELECT status,revision FROM project_status_order WHERE project_id=$1
ORDER BY CASE status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'review' THEN 3 ELSE 4 END;

-- name: IssuesGet :one
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.id=$1;

-- name: IssuesSearch :many
-- Digit-only queries match issue numbers exactly; text normalization avoids integer overflow from user input.
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN priorities priority_choice ON priority_choice.id=i.priority_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND (CASE sqlc.arg(query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(query_number)::bigint ELSE (p.key=sqlc.arg(query_project_key)::text AND i.number=sqlc.narg(query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(query)::text)) OR i.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(statuses)::text[]) OR category=ANY(sqlc.arg(statuses)::text[])))
 AND (cardinality(sqlc.arg(priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(priorities)::text[])))
 AND (cardinality(sqlc.arg(types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(types)::text[])))
 AND (cardinality(sqlc.arg(type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(type_ids)::uuid[]))
 AND (sqlc.arg(type_behavior)::text='' OR i.type_id IN (SELECT id FROM issue_types WHERE behavior=sqlc.arg(type_behavior)::text))
 AND (cardinality(sqlc.arg(priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(stage_ids)::uuid[]))
 AND (NOT sqlc.arg(unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(assignee_id)::uuid)
 AND (sqlc.narg(parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(parent_id)::uuid)
 AND (sqlc.narg(prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(due_from)::date IS NULL OR i.due_date>=sqlc.narg(due_from)::date)
 AND (sqlc.narg(due_to)::date IS NULL OR i.due_date<=sqlc.narg(due_to)::date)
 AND (sqlc.narg(overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(overdue)::boolean)
 AND (sqlc.narg(blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(blocked)::boolean)
 AND (NOT sqlc.arg(has_cursor)::boolean OR ((CASE sqlc.arg(sort_by)::text WHEN 'created' THEN (extract(epoch FROM i.created_at)*1000000)::bigint WHEN 'due' THEN -coalesce(extract(epoch FROM i.due_date)::bigint,253402214400) WHEN 'priority' THEN CASE WHEN p.core_mode='modern' THEN priority_choice.sort_order ELSE CASE i.priority WHEN 'high' THEN 3::bigint WHEN 'medium' THEN 2::bigint ELSE 1::bigint END END ELSE (extract(epoch FROM i.updated_at)*1000000)::bigint END),i.updated_at,i.id)<(sqlc.arg(after_sort)::bigint,sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY (CASE sqlc.arg(sort_by)::text WHEN 'created' THEN (extract(epoch FROM i.created_at)*1000000)::bigint WHEN 'due' THEN -coalesce(extract(epoch FROM i.due_date)::bigint,253402214400) WHEN 'priority' THEN CASE WHEN p.core_mode='modern' THEN priority_choice.sort_order ELSE CASE i.priority WHEN 'high' THEN 3::bigint WHEN 'medium' THEN 2::bigint ELSE 1::bigint END END ELSE (extract(epoch FROM i.updated_at)*1000000)::bigint END) DESC,i.updated_at DESC,i.id DESC LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesSearchCount :one
SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND (CASE sqlc.arg(query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(query_number)::bigint ELSE (p.key=sqlc.arg(query_project_key)::text AND i.number=sqlc.narg(query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(query)::text)) OR i.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(statuses)::text[]) OR category=ANY(sqlc.arg(statuses)::text[])))
 AND (cardinality(sqlc.arg(priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(priorities)::text[])))
 AND (cardinality(sqlc.arg(types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(types)::text[])))
 AND (cardinality(sqlc.arg(type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(type_ids)::uuid[]))
 AND (sqlc.arg(type_behavior)::text='' OR i.type_id IN (SELECT id FROM issue_types WHERE behavior=sqlc.arg(type_behavior)::text))
 AND (cardinality(sqlc.arg(priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(stage_ids)::uuid[]))
 AND (NOT sqlc.arg(unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(assignee_id)::uuid)
 AND (sqlc.narg(parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(parent_id)::uuid)
 AND (sqlc.narg(prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(due_from)::date IS NULL OR i.due_date>=sqlc.narg(due_from)::date)
 AND (sqlc.narg(due_to)::date IS NULL OR i.due_date<=sqlc.narg(due_to)::date)
 AND (sqlc.narg(overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(overdue)::boolean)
 AND (sqlc.narg(blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(blocked)::boolean);

-- name: IssuesMove :one
UPDATE issues SET status=$2,rank=$3,backlog=false,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *;

-- name: IssuesReorder :one
UPDATE issues SET rank=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *;

-- name: IssuesAffectedCompletion :many
SELECT i.*, (SELECT count(*)::integer FROM issue_dependencies d JOIN issues blocker ON blocker.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND blocker.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blockers, (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_children, EXISTS(SELECT 1 FROM issue_dependencies d WHERE d.dependent_id=i.id AND d.blocker_id=$2 AND d.removed_at IS NULL) AS is_blocker, coalesce(i.id=(SELECT child.parent_id FROM issues child WHERE child.id=$2),false)::boolean AS is_parent FROM issues i WHERE i.project_id=$1 AND (i.id=(SELECT child.parent_id FROM issues child WHERE child.id=$2) OR EXISTS(SELECT 1 FROM issue_dependencies d WHERE d.dependent_id=i.id AND d.blocker_id=$2 AND d.removed_at IS NULL));

-- name: IssuesAdvanceGraph :one
UPDATE projects SET graph_revision=graph_revision+1 WHERE id=$1 RETURNING graph_revision;

-- name: IssuesLockFieldRow :one
SELECT id FROM issues WHERE id=$1 FOR UPDATE;

-- name: IssuesRegisterMigrationStage :exec
INSERT INTO project_status_order(project_id,status,stage_name) VALUES($1,$2,$3);
-- name: IssuesSetMigrationStage :exec
UPDATE issues SET workflow_id=$2,stage_id=$3 WHERE id=$1;

-- name: IssuesMoveCanonical :one
UPDATE issues SET workflow_id=$2,stage_id=$3,status=$4,rank=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *;
