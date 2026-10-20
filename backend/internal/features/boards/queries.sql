-- name: ReadBoard :one
SELECT * FROM boards WHERE id = $1;


-- name: BoardsInsert :one
INSERT INTO boards(id,project_id,name,name_key,created_by,saved_filters,workflow)
SELECT sqlc.arg(id),sqlc.arg(project_id),sqlc.arg(name),sqlc.arg(name_key),sqlc.arg(created_by),sqlc.arg(saved_filters)::jsonb,workflow FROM boards WHERE project_id=sqlc.arg(project_id) AND is_default RETURNING *;

-- name: BoardsUpdate :one
UPDATE boards SET name=sqlc.arg(name),name_key=sqlc.arg(name_key),saved_filters=sqlc.arg(saved_filters)::jsonb,in_progress_limit=sqlc.narg(in_progress_limit),review_limit=sqlc.narg(review_limit),workflow=sqlc.arg(workflow)::jsonb,revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id) RETURNING *;

-- name: BoardsSetArchive :one
UPDATE boards SET archived_at=CASE WHEN sqlc.arg(archived)::boolean THEN now() ELSE NULL END,revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id) RETURNING *;

-- name: BoardsGet :one
SELECT sqlc.embed(b),u.display_name AS creator_name FROM boards b JOIN users u ON u.id=b.created_by WHERE b.id=$1;

-- name: BoardsDefault :one
SELECT sqlc.embed(b),u.display_name AS creator_name FROM boards b JOIN users u ON u.id=b.created_by WHERE b.project_id=$1 AND b.is_default;

-- name: BoardsList :many
SELECT sqlc.embed(b),u.display_name AS creator_name FROM boards b JOIN users u ON u.id=b.created_by
WHERE b.project_id=sqlc.arg(project_id) AND (sqlc.arg(include_archived)::boolean OR b.archived_at IS NULL)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (b.name_key COLLATE "C",b.id)>(sqlc.arg(after_name)::text COLLATE "C",sqlc.arg(after_id)::uuid))
ORDER BY b.name_key COLLATE "C",b.id LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsListCount :one
SELECT count(*) FROM boards WHERE project_id=$1 AND (sqlc.arg(include_archived)::boolean OR archived_at IS NULL);

-- name: BoardsCounts :many
-- Saved and temporary queries use the same exact number/key/title rules as issue search.
SELECT o.status,o.revision,
 (SELECT count(*)::integer FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=o.project_id AND i.status=o.status 
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (p.key=sqlc.arg(saved_query_project_key)::text AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(saved_query)::text)) OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(saved_statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(saved_statuses)::text[]) OR category=ANY(sqlc.arg(saved_statuses)::text[])))
 AND (cardinality(sqlc.arg(saved_priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(saved_priorities)::text[])))
 AND (cardinality(sqlc.arg(saved_types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(saved_types)::text[])))
 AND (cardinality(sqlc.arg(saved_type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(saved_type_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(saved_priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(saved_workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(saved_stage_ids)::uuid[]))
 AND (NOT sqlc.arg(saved_unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(saved_assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(saved_assignee_id)::uuid)
 AND (sqlc.narg(saved_parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_parent_id)::uuid)
 AND (sqlc.narg(saved_prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(saved_prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(saved_label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(saved_due_from)::date IS NULL OR i.due_date>=sqlc.narg(saved_due_from)::date)
 AND (sqlc.narg(saved_due_to)::date IS NULL OR i.due_date<=sqlc.narg(saved_due_to)::date)
 AND (sqlc.narg(saved_overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(saved_overdue)::boolean)
 AND (sqlc.narg(saved_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(saved_blocked)::boolean)) AS saved_count,
 (SELECT count(*)::integer FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=o.project_id AND i.status=o.status 
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (p.key=sqlc.arg(saved_query_project_key)::text AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(saved_query)::text)) OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(saved_statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(saved_statuses)::text[]) OR category=ANY(sqlc.arg(saved_statuses)::text[])))
 AND (cardinality(sqlc.arg(saved_priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(saved_priorities)::text[])))
 AND (cardinality(sqlc.arg(saved_types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(saved_types)::text[])))
 AND (cardinality(sqlc.arg(saved_type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(saved_type_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(saved_priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(saved_workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(saved_stage_ids)::uuid[]))
 AND (NOT sqlc.arg(saved_unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(saved_assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(saved_assignee_id)::uuid)
 AND (sqlc.narg(saved_parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_parent_id)::uuid)
 AND (sqlc.narg(saved_prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(saved_prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(saved_label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(saved_due_from)::date IS NULL OR i.due_date>=sqlc.narg(saved_due_from)::date)
 AND (sqlc.narg(saved_due_to)::date IS NULL OR i.due_date<=sqlc.narg(saved_due_to)::date)
 AND (sqlc.narg(saved_overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(saved_overdue)::boolean)
 AND (sqlc.narg(saved_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(saved_blocked)::boolean) 
 AND (cardinality(sqlc.arg(temporary_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(temporary_project_ids)::uuid[]))
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (p.key=sqlc.arg(temporary_query_project_key)::text AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(temporary_query)::text)) OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(temporary_statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(temporary_statuses)::text[]) OR category=ANY(sqlc.arg(temporary_statuses)::text[])))
 AND (cardinality(sqlc.arg(temporary_priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(temporary_priorities)::text[])))
 AND (cardinality(sqlc.arg(temporary_types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(temporary_types)::text[])))
 AND (cardinality(sqlc.arg(temporary_type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(temporary_type_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(temporary_priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(temporary_workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(temporary_stage_ids)::uuid[]))
 AND (NOT sqlc.arg(temporary_unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(temporary_assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(temporary_assignee_id)::uuid)
 AND (sqlc.narg(temporary_parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(temporary_parent_id)::uuid)
 AND (sqlc.narg(temporary_prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(temporary_prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(temporary_prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(temporary_label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(temporary_due_from)::date IS NULL OR i.due_date>=sqlc.narg(temporary_due_from)::date)
 AND (sqlc.narg(temporary_due_to)::date IS NULL OR i.due_date<=sqlc.narg(temporary_due_to)::date)
 AND (sqlc.narg(temporary_overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(temporary_overdue)::boolean)
 AND (sqlc.narg(temporary_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(temporary_blocked)::boolean)) AS visible_count
FROM project_status_order o WHERE o.project_id=sqlc.arg(project_id)::uuid
ORDER BY CASE o.status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'review' THEN 3 ELSE 4 END;

-- name: BoardsCards :many
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND i.status=sqlc.arg(status)::text
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (p.key=sqlc.arg(saved_query_project_key)::text AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(saved_query)::text)) OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(saved_statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(saved_statuses)::text[]) OR category=ANY(sqlc.arg(saved_statuses)::text[])))
 AND (cardinality(sqlc.arg(saved_priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(saved_priorities)::text[])))
 AND (cardinality(sqlc.arg(saved_types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(saved_types)::text[])))
 AND (cardinality(sqlc.arg(saved_type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(saved_type_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(saved_priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(saved_workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(saved_stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(saved_stage_ids)::uuid[]))
 AND (NOT sqlc.arg(saved_unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(saved_assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(saved_assignee_id)::uuid)
 AND (sqlc.narg(saved_parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_parent_id)::uuid)
 AND (sqlc.narg(saved_prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(saved_prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(saved_prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(saved_label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(saved_due_from)::date IS NULL OR i.due_date>=sqlc.narg(saved_due_from)::date)
 AND (sqlc.narg(saved_due_to)::date IS NULL OR i.due_date<=sqlc.narg(saved_due_to)::date)
 AND (sqlc.narg(saved_overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(saved_overdue)::boolean)
 AND (sqlc.narg(saved_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(saved_blocked)::boolean)
 AND (cardinality(sqlc.arg(temporary_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(temporary_project_ids)::uuid[]))
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (p.key=sqlc.arg(temporary_query_project_key)::text AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(temporary_query)::text)) OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
 AND (cardinality(sqlc.arg(temporary_statuses)::text[])=0 OR i.stage_id IN (SELECT id FROM workflow_stages WHERE legacy_status=ANY(sqlc.arg(temporary_statuses)::text[]) OR category=ANY(sqlc.arg(temporary_statuses)::text[])))
 AND (cardinality(sqlc.arg(temporary_priorities)::text[])=0 OR i.priority_id IN (SELECT id FROM priorities WHERE (CASE WHEN key IN('low','medium','high') THEN key ELSE 'medium' END)=ANY(sqlc.arg(temporary_priorities)::text[])))
 AND (cardinality(sqlc.arg(temporary_types)::text[])=0 OR i.type_id IN (SELECT id FROM issue_types WHERE (CASE WHEN behavior='subtask' THEN 'subtask' WHEN key='bug' THEN 'bug' ELSE 'task' END)=ANY(sqlc.arg(temporary_types)::text[])))
 AND (cardinality(sqlc.arg(temporary_type_ids)::uuid[])=0 OR i.type_id=ANY(sqlc.arg(temporary_type_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_priority_ids)::uuid[])=0 OR i.priority_id=ANY(sqlc.arg(temporary_priority_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_workflow_ids)::uuid[])=0 OR i.workflow_id=ANY(sqlc.arg(temporary_workflow_ids)::uuid[]))
 AND (cardinality(sqlc.arg(temporary_stage_ids)::uuid[])=0 OR i.stage_id=ANY(sqlc.arg(temporary_stage_ids)::uuid[]))
 AND (NOT sqlc.arg(temporary_unassigned)::boolean OR i.assignee_id IS NULL)
 AND (sqlc.narg(temporary_assignee_id)::uuid IS NULL OR i.assignee_id=sqlc.narg(temporary_assignee_id)::uuid)
 AND (sqlc.narg(temporary_parent_id)::uuid IS NULL OR i.parent_id=sqlc.narg(temporary_parent_id)::uuid)
 AND (sqlc.narg(temporary_prerequisite_for)::uuid IS NULL OR i.parent_id=sqlc.narg(temporary_prerequisite_for)::uuid OR EXISTS(SELECT 1 FROM issue_dependencies prerequisite WHERE prerequisite.dependent_id=sqlc.narg(temporary_prerequisite_for)::uuid AND prerequisite.blocker_id=i.id AND prerequisite.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM unnest(sqlc.arg(temporary_label_ids)::uuid[]) selected(id) WHERE NOT EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=selected.id))
 AND (sqlc.narg(temporary_due_from)::date IS NULL OR i.due_date>=sqlc.narg(temporary_due_from)::date)
 AND (sqlc.narg(temporary_due_to)::date IS NULL OR i.due_date<=sqlc.narg(temporary_due_to)::date)
 AND (sqlc.narg(temporary_overdue)::boolean IS NULL OR coalesce(i.due_date<sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'),false)=sqlc.narg(temporary_overdue)::boolean)
 AND (sqlc.narg(temporary_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(temporary_blocked)::boolean)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (i.rank,i.number)>(sqlc.arg(after_rank)::bigint,sqlc.arg(after_number)::bigint))
ORDER BY i.rank,i.number LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsRegisterStage :exec
INSERT INTO project_status_order(project_id,status,stage_name) VALUES($1,$2,$3);

-- name: BoardsProjectWorkflows :many
SELECT id,workflow,saved_filters FROM boards WHERE project_id=$1 ORDER BY id;

-- name: BoardsSaveExpandedWorkflow :exec
UPDATE boards SET workflow=$2::jsonb,saved_filters=$3::jsonb,revision=revision+1,updated_at=now() WHERE id=$1;

-- name: BoardsStageUsage :one
SELECT count(*)::integer FROM issues WHERE project_id=$1 AND status=$2;

-- name: BoardsActiveWorkflows :many
SELECT id,workflow FROM boards WHERE project_id=$1 AND archived_at IS NULL ORDER BY id;

-- name: BoardsUpdateStageName :exec
UPDATE project_status_order SET stage_name=$3 WHERE project_id=$1 AND status=$2;

-- name: BoardsRetireStage :exec
UPDATE project_status_order SET retired=true,revision=revision+1 WHERE project_id=$1 AND status=$2;

-- name: BoardsStageRecords :many
SELECT status,retired FROM project_status_order WHERE project_id=$1;

-- name: BoardsRetirementIssues :many
SELECT id FROM issues WHERE project_id=$1 AND status=$2 ORDER BY id LIMIT 101;

-- name: BoardsCardEpics :many
-- The caller supplies only the returned card IDs after the board's authorized page read.
SELECT i.id AS issue_id,e.id AS epic_id,e.name AS epic_name
FROM issues i JOIN planning_issue a ON a.issue_id=i.id
JOIN planning_items e ON e.id=a.epic_id AND e.project_id=i.project_id AND e.kind='epic'
WHERE i.project_id=sqlc.arg(project_id) AND i.id=ANY(sqlc.arg(issue_ids)::uuid[])
ORDER BY i.number;
