-- name: BoardsLayoutColumns :many
SELECT * FROM board_columns WHERE board_id=$1 ORDER BY position,id;

-- name: BoardsLayoutStages :many
SELECT mapping.column_id,s.*,w.name AS workflow_name,w.revision AS workflow_revision,w.retired AS workflow_retired
FROM board_column_stages mapping JOIN workflow_stages s ON s.id=mapping.stage_id
JOIN workflows w ON w.id=s.workflow_id WHERE mapping.board_id=$1 ORDER BY mapping.column_id,w.id,s.position,s.id;

-- name: BoardsCustomReadPlan :exec
SET LOCAL plan_cache_mode = force_custom_plan;

-- name: BoardsLayoutCounts :many
-- Saved and temporary queries use the same exact number/key/title rules as issue search.
SELECT o.id,o.order_revision,
 (SELECT count(*)::integer FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=o.project_id AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=o.id AND mapping.stage_id=i.stage_id) 
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 (SELECT count(*)::integer FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=o.project_id AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=o.id AND mapping.stage_id=i.stage_id) 
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
FROM board_columns o WHERE o.board_id=sqlc.arg(board_id)::uuid AND (sqlc.narg(column_id)::uuid IS NULL OR o.id=sqlc.narg(column_id)::uuid)
ORDER BY o.position,o.id;

-- name: BoardsRankedCards :many
SELECT br.rank AS board_rank,sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM board_issue_ranks br JOIN issues i ON i.id=br.issue_id AND i.project_id=br.project_id JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.board_id=sqlc.arg(board_id)::uuid AND mapping.column_id=sqlc.arg(column_id)::uuid AND mapping.stage_id=i.stage_id)
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
 AND br.board_id=sqlc.arg(board_id)::uuid AND br.column_id=sqlc.arg(column_id)::uuid
 AND (NOT sqlc.arg(has_cursor)::boolean OR (br.rank,i.id)>(sqlc.arg(after_rank)::bigint,sqlc.arg(after_id)::uuid))
ORDER BY br.rank,i.id LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsUnrankedCards :many
SELECT 0::bigint AS board_rank,sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.board_id=sqlc.arg(board_id)::uuid AND mapping.column_id=sqlc.arg(column_id)::uuid AND mapping.stage_id=i.stage_id)
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
 AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=sqlc.arg(board_id)::uuid AND r.column_id=sqlc.arg(column_id)::uuid AND r.issue_id=i.id)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (i.created_at,i.id)>(sqlc.arg(after_created)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY i.created_at,i.id LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsLockColumns :many
SELECT * FROM board_columns WHERE board_id=$1 AND id=ANY(sqlc.arg(column_ids)::uuid[]) ORDER BY id FOR UPDATE;

-- name: BoardsRankForIssue :one
SELECT r.* FROM board_issue_ranks r JOIN issues i ON i.id=r.issue_id
JOIN board_column_stages mapping ON mapping.board_id=r.board_id AND mapping.column_id=r.column_id AND mapping.stage_id=i.stage_id
WHERE r.board_id=$1 AND r.issue_id=$2 AND NOT i.archived AND NOT i.backlog;

-- name: BoardsRankBefore :one
SELECT coalesce(max(r.rank),0)::bigint FROM board_issue_ranks r JOIN issues i ON i.id=r.issue_id
JOIN board_column_stages mapping ON mapping.board_id=r.board_id AND mapping.column_id=r.column_id AND mapping.stage_id=i.stage_id
WHERE r.board_id=$1 AND r.column_id=$2 AND r.issue_id<>$3 AND NOT i.archived AND NOT i.backlog AND r.rank<$4;

-- name: BoardsRankAfter :one
SELECT coalesce(min(r.rank),0)::bigint FROM board_issue_ranks r JOIN issues i ON i.id=r.issue_id
JOIN board_column_stages mapping ON mapping.board_id=r.board_id AND mapping.column_id=r.column_id AND mapping.stage_id=i.stage_id
WHERE r.board_id=$1 AND r.column_id=$2 AND r.issue_id<>$3 AND NOT i.archived AND NOT i.backlog AND r.rank>$4;

-- name: BoardsRankMaximum :one
SELECT coalesce(max(r.rank),0)::bigint FROM board_issue_ranks r JOIN issues i ON i.id=r.issue_id
JOIN board_column_stages mapping ON mapping.board_id=r.board_id AND mapping.column_id=r.column_id AND mapping.stage_id=i.stage_id
WHERE r.board_id=$1 AND r.column_id=$2 AND r.issue_id<>$3 AND NOT i.archived AND NOT i.backlog;

-- name: BoardsPutRank :exec
INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank) VALUES($1,$2,$3,$4,$5)
ON CONFLICT(board_id,issue_id) DO UPDATE SET column_id=EXCLUDED.column_id,rank=EXCLUDED.rank;

-- name: BoardsAdvanceColumn :one
UPDATE board_columns SET order_revision=order_revision+1 WHERE id=$1 RETURNING order_revision;

-- name: BoardsOrderPrefix :many
SELECT i.id,r.rank, i.created_at FROM issues i
JOIN board_column_stages mapping ON mapping.project_id=i.project_id AND mapping.stage_id=i.stage_id
LEFT JOIN board_issue_ranks r ON r.board_id=mapping.board_id AND r.column_id=mapping.column_id AND r.issue_id=i.id
WHERE mapping.board_id=$1 AND mapping.column_id=$2 AND NOT i.archived AND NOT i.backlog
ORDER BY r.rank IS NULL,r.rank,CASE WHEN r.rank IS NULL THEN i.created_at END,i.id LIMIT 2001;

-- name: BoardsEligibleDropStages :many
SELECT s.id FROM board_column_stages mapping JOIN workflow_stages s ON s.id=mapping.stage_id
JOIN workflow_transitions edge ON edge.project_id=s.project_id AND edge.workflow_id=s.workflow_id AND edge.to_stage_id=s.id
WHERE mapping.board_id=$1 AND mapping.column_id=$2 AND s.workflow_id=$3 AND edge.from_stage_id=$4 AND NOT edge.retired AND NOT s.retired AND s.accepts_entries
AND (edge.required_permission IS NULL OR edge.required_permission='member' OR sqlc.arg(can_configure)::boolean)
ORDER BY s.position,s.id;

-- name: BoardsVisibleIssue :one
SELECT EXISTS(SELECT 1 FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.board_id=sqlc.arg(board_id)::uuid AND mapping.column_id=sqlc.arg(column_id)::uuid AND mapping.stage_id=i.stage_id)
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
 AND i.id=sqlc.arg(issue_id)::uuid)::boolean AS visible;

-- name: BoardsHardCapacityColumns :many
SELECT c.* FROM board_columns c JOIN boards b ON b.id=c.board_id
WHERE c.project_id=ANY(sqlc.arg(project_ids)::uuid[]) AND b.archived_at IS NULL AND c.wip_mode='block' AND c.wip_limit IS NOT NULL
AND (sqlc.narg(stage_id)::uuid IS NULL OR EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=c.id AND mapping.stage_id=sqlc.narg(stage_id)::uuid))
ORDER BY c.project_id,c.id FOR UPDATE OF c;

-- name: BoardsSaveLayoutSettings :exec
UPDATE boards SET name=$2,name_key=$3,saved_filters=sqlc.arg(saved_filters)::jsonb,revision=revision+1,updated_at=now() WHERE id=$1;

-- name: BoardsSaveColumn :one
INSERT INTO board_columns(id,project_id,board_id,name,position,wip_limit,wip_mode)
VALUES($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,wip_limit=EXCLUDED.wip_limit,wip_mode=EXCLUDED.wip_mode,order_revision=board_columns.order_revision+1
WHERE board_columns.project_id=EXCLUDED.project_id AND board_columns.board_id=EXCLUDED.board_id RETURNING id;

-- name: BoardsDeleteMappings :exec
DELETE FROM board_column_stages WHERE board_id=$1;

-- name: BoardsSaveMapping :exec
INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) VALUES($1,$2,$3,$4);

-- name: BoardsDeleteUnusedColumns :exec
DELETE FROM board_columns WHERE board_id=$1 AND NOT(id=ANY(sqlc.arg(column_ids)::uuid[]));

-- name: BoardsRequiredDefaultStages :many
SELECT s.id FROM workflow_stages s WHERE s.project_id=$1
AND (EXISTS(SELECT 1 FROM issues i WHERE i.project_id=s.project_id AND i.stage_id=s.id)
OR (NOT s.retired AND s.accepts_entries AND EXISTS(SELECT 1 FROM issue_type_workflows binding WHERE binding.workflow_id=s.workflow_id AND binding.accepts_new)));

-- name: BoardsScopedStage :one
SELECT EXISTS(SELECT 1 FROM workflow_stages WHERE project_id=$1 AND id=$2)::boolean AS valid;

-- name: BoardsSavedLayoutCounts :many
-- Saved and temporary queries use the same exact number/key/title rules as issue search.
SELECT o.id,o.order_revision,
 (SELECT count(*)::integer FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=o.project_id AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.column_id=o.id AND mapping.stage_id=i.stage_id) 
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (sqlc.narg(saved_blocked)::boolean IS NULL OR EXISTS(SELECT 1 FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))=sqlc.narg(saved_blocked)::boolean)) AS saved_count
FROM board_columns o WHERE o.board_id=sqlc.arg(board_id)::uuid AND (sqlc.narg(column_id)::uuid IS NULL OR o.id=sqlc.narg(column_id)::uuid)
ORDER BY o.position,o.id;

-- name: BoardsLockOrderIssues :many
SELECT id FROM issues WHERE project_id=$1 AND id=ANY(sqlc.arg(issue_ids)::uuid[]) ORDER BY id FOR SHARE;

-- name: BoardsRankHasTie :one
SELECT count(*)>1 AS tied FROM (
 SELECT r.issue_id FROM board_issue_ranks r JOIN issues i ON i.id=r.issue_id
 JOIN board_column_stages mapping ON mapping.board_id=r.board_id AND mapping.column_id=r.column_id AND mapping.stage_id=i.stage_id
 WHERE r.board_id=$1 AND r.column_id=$2 AND r.rank=$3 AND NOT i.archived AND NOT i.backlog LIMIT 2
) bounded;

-- name: BoardsUnrankedPrefix :many
SELECT i.id FROM issues i JOIN board_column_stages mapping ON mapping.project_id=i.project_id AND mapping.stage_id=i.stage_id
WHERE i.project_id=$1 AND mapping.board_id=$2 AND mapping.column_id=$3 AND NOT i.archived AND NOT i.backlog AND i.id<>sqlc.arg(moving_id)::uuid
AND (i.created_at,i.id)<=(SELECT a.created_at,a.id FROM issues a WHERE a.project_id=i.project_id AND a.id=sqlc.arg(anchor_id)::uuid)
AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=mapping.board_id AND r.column_id=mapping.column_id AND r.issue_id=i.id)
ORDER BY i.created_at,i.id LIMIT 2001;

-- name: BoardsPutRanks :exec
INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank)
SELECT sqlc.arg(project_id)::uuid,sqlc.arg(board_id)::uuid,sqlc.arg(column_id)::uuid,ordered.issue_id,(sqlc.arg(base_rank)::bigint+ordered.position*1024)::bigint
FROM unnest(sqlc.arg(issue_ids)::uuid[]) WITH ORDINALITY ordered(issue_id,position)
ON CONFLICT(board_id,issue_id) DO UPDATE SET column_id=EXCLUDED.column_id,rank=EXCLUDED.rank;

-- name: BoardsLastUnranked :one
SELECT i.id FROM issues i JOIN board_column_stages mapping ON mapping.project_id=i.project_id AND mapping.stage_id=i.stage_id
WHERE i.project_id=$1 AND mapping.board_id=$2 AND mapping.column_id=$3 AND NOT i.archived AND NOT i.backlog AND i.id<>sqlc.arg(moving_id)::uuid
AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=mapping.board_id AND r.column_id=mapping.column_id AND r.issue_id=i.id)
ORDER BY i.created_at DESC,i.id DESC LIMIT 1;

-- name: BoardsSelectiveRankedCards :many
WITH candidates AS MATERIALIZED (SELECT i.id FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.board_id=sqlc.arg(board_id)::uuid AND mapping.column_id=sqlc.arg(column_id)::uuid AND mapping.stage_id=i.stage_id)
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
)
SELECT br.rank AS board_rank,sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM candidates candidate JOIN board_issue_ranks br ON br.issue_id=candidate.id JOIN issues i ON i.id=br.issue_id AND i.project_id=br.project_id JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.project_id=sqlc.arg(project_id)::uuid AND br.board_id=sqlc.arg(board_id)::uuid AND br.column_id=sqlc.arg(column_id)::uuid
 AND (NOT sqlc.arg(has_cursor)::boolean OR (br.rank,i.id)>(sqlc.arg(after_rank)::bigint,sqlc.arg(after_id)::uuid))
ORDER BY br.rank,i.id LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsSelectiveUnrankedCards :many
WITH candidates AS MATERIALIZED (SELECT i.id FROM issues i JOIN projects p ON p.id=i.project_id WHERE NOT i.archived AND NOT i.backlog AND i.project_id=sqlc.arg(project_id)::uuid AND EXISTS(SELECT 1 FROM board_column_stages mapping WHERE mapping.board_id=sqlc.arg(board_id)::uuid AND mapping.column_id=sqlc.arg(column_id)::uuid AND mapping.stage_id=i.stage_id)
 AND (cardinality(sqlc.arg(saved_project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(saved_project_ids)::uuid[]))
 AND (CASE sqlc.arg(saved_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(saved_query_number)::bigint ELSE (sqlc.arg(saved_query_project_matches)::boolean AND i.number=sqlc.narg(saved_query_key_number)::bigint) OR sqlc.arg(saved_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(saved_query_pattern)::text ESCAPE '\' END)
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
 AND (CASE sqlc.arg(temporary_query_kind)::text WHEN 'empty' THEN true WHEN 'none' THEN false WHEN 'number' THEN i.number=sqlc.narg(temporary_query_number)::bigint ELSE (sqlc.arg(temporary_query_project_matches)::boolean AND i.number=sqlc.narg(temporary_query_key_number)::bigint) OR sqlc.arg(temporary_query_prefix_matches)::boolean OR i.title ILIKE sqlc.arg(temporary_query_pattern)::text ESCAPE '\' END)
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
)
SELECT 0::bigint AS board_rank,sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM candidates candidate JOIN issues i ON i.id=candidate.id JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.project_id=sqlc.arg(project_id)::uuid AND NOT EXISTS(SELECT 1 FROM board_issue_ranks r WHERE r.board_id=sqlc.arg(board_id)::uuid AND r.column_id=sqlc.arg(column_id)::uuid AND r.issue_id=i.id)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (i.created_at,i.id)>(sqlc.arg(after_created)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY i.created_at,i.id LIMIT sqlc.arg(page_size)::integer;

-- name: BoardsUnfilteredLayoutCounts :many
-- With no saved/temporary predicates, count the canonical mapped stages
-- directly. Avoid compiling the unrelated optional filter branches.
SELECT c.id,c.order_revision,
 coalesce((SELECT sum((SELECT count(*) FROM issue_records i
 WHERE i.project_id=mapping.project_id AND i.stage_id=mapping.stage_id AND NOT i.archived AND NOT i.backlog))
 FROM board_column_stages mapping WHERE mapping.column_id=c.id),0)::integer AS saved_count
FROM board_columns c WHERE c.board_id=$1 AND (sqlc.narg(column_id)::uuid IS NULL OR c.id=sqlc.narg(column_id)::uuid)
ORDER BY c.position,c.id;

-- name: BoardsNativeMetadata :one
SELECT b.id,b.project_id,b.name,b.created_by,b.is_default,b.saved_filters,b.filters_version,b.revision,b.archived_at,u.display_name AS creator_name
FROM board_records b JOIN users u ON u.id=b.created_by WHERE b.id=$1;
