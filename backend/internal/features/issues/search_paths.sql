-- Stable hot query shapes keep number, trigram and time indexes usable with generic prepared plans.

-- name: IssuesSearchNumber :many
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
 AND i.number=sqlc.narg(query_number)::bigint
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


-- name: IssuesSearchNumberCount :one
SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND i.number=sqlc.narg(query_number)::bigint
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


-- name: IssuesSearchText :many
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
 AND i.id IN (
  SELECT keyed.id FROM issues keyed JOIN projects keyed_project ON keyed_project.id=keyed.project_id
   WHERE keyed_project.key=sqlc.arg(query_project_key)::text AND keyed.number=sqlc.narg(query_key_number)::bigint
  UNION
  SELECT prefixed.id FROM issues prefixed JOIN projects prefix_project ON prefix_project.id=prefixed.project_id
   WHERE starts_with(lower(prefix_project.key||'-'),lower(sqlc.arg(query)::text))
  UNION
  SELECT titled.id FROM issues titled WHERE titled.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\'
 )
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


-- name: IssuesSearchTextCount :one
SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND i.id IN (
  SELECT keyed.id FROM issues keyed JOIN projects keyed_project ON keyed_project.id=keyed.project_id
   WHERE keyed_project.key=sqlc.arg(query_project_key)::text AND keyed.number=sqlc.narg(query_key_number)::bigint
  UNION
  SELECT prefixed.id FROM issues prefixed JOIN projects prefix_project ON prefix_project.id=prefixed.project_id
   WHERE starts_with(lower(prefix_project.key||'-'),lower(sqlc.arg(query)::text))
  UNION
  SELECT titled.id FROM issues titled WHERE titled.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\'
 )
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


-- name: IssuesSearchUpdated :many
-- Digit-only queries match issue numbers exactly; text normalization avoids integer overflow from user input.
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND true
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
 AND (NOT sqlc.arg(has_cursor)::boolean OR (i.updated_at,i.id)<(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY i.updated_at DESC,i.id DESC LIMIT sqlc.arg(page_size)::integer;


-- name: IssuesSearchEmptyCount :one
SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))
 AND true
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


-- name: IssuesSearchCustomPlan :one
-- Text prefixes vary from zero matches to an entire project. Ask PostgreSQL
-- to plan this transaction's search for its actual parameters; numeric lookups
-- retain stable generic plans. This setting ends at transaction completion.
SELECT set_config('plan_cache_mode','force_custom_plan',true)::text;

-- name: IssuesSearchPrefixUpdated :many
-- Digit-only queries match issue numbers exactly; text normalization avoids integer overflow from user input.
SELECT sqlc.embed(i),p.key AS project_key,u.display_name AS assignee_name,r.display_name AS reporter_name,coalesce((SELECT stage_name FROM project_status_order o WHERE o.project_id=i.project_id AND o.status=i.status),i.status)::text AS status_name,parent.number AS parent_number,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'projectId',l.project_id,'name',l.name) ORDER BY l.name_key,l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id),'[]'::jsonb)::jsonb AS labels,
 (SELECT count(*)::integer FROM issue_dependencies d JOIN issues b ON b.id=d.blocker_id WHERE d.dependent_id=i.id AND d.removed_at IS NULL AND b.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done')) AS unfinished_blocker_count,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id) AS child_total,
 (SELECT count(*)::integer FROM issues child WHERE child.parent_id=i.id AND child.stage_id IN (SELECT id FROM workflow_stages WHERE category='done')) AS child_done
FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id
LEFT JOIN users u ON u.id=i.assignee_id LEFT JOIN issues parent ON parent.id=i.parent_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))

 AND ((p.key=sqlc.arg(query_project_key)::text AND i.number=sqlc.narg(query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(query)::text)) OR i.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\')
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
 AND (NOT sqlc.arg(has_cursor)::boolean OR (i.updated_at,i.id)<(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY i.updated_at DESC,i.id DESC LIMIT sqlc.arg(page_size)::integer;


-- name: IssuesSearchPrefixCount :one
SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id
WHERE i.archived=coalesce(sqlc.narg(archived)::boolean,false) AND (sqlc.narg(backlog)::boolean IS NULL OR i.backlog=sqlc.narg(backlog)::boolean)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL))
 AND (cardinality(sqlc.arg(project_ids)::uuid[])=0 OR i.project_id=ANY(sqlc.arg(project_ids)::uuid[]))

 AND ((p.key=sqlc.arg(query_project_key)::text AND i.number=sqlc.narg(query_key_number)::bigint) OR starts_with(lower(p.key||'-'),lower(sqlc.arg(query)::text)) OR i.title ILIKE sqlc.arg(query_pattern)::text ESCAPE '\')
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



-- name: IssuesSearchHasPrefix :one
SELECT EXISTS(SELECT 1 FROM projects p WHERE starts_with(lower(p.key||'-'),lower(sqlc.arg(query)::text))
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=p.id AND m.user_id=sqlc.arg(caller_id)::uuid AND m.removed_at IS NULL)));
