-- name: ConfigurationActivationSnapshot :one
SELECT p.revision AS project_revision,
 coalesce((SELECT b.id FROM board_records b WHERE b.project_id=p.id AND b.is_default AND b.archived_at IS NULL),'00000000-0000-0000-0000-000000000000'::uuid)::uuid AS board_id,
 coalesce((SELECT b.revision FROM board_records b WHERE b.project_id=p.id AND b.is_default AND b.archived_at IS NULL),0)::bigint AS board_revision,
 (SELECT count(*) FROM issue_records i WHERE i.project_id=p.id) AS issue_count,
 EXISTS(SELECT 1 FROM issue_records i WHERE i.project_id=p.id AND (i.type_id IS NULL OR i.priority_id IS NULL OR i.workflow_id IS NULL OR i.stage_id IS NULL)) AS incomplete_references,
 EXISTS(SELECT 1 FROM workflow_stages s WHERE s.project_id=p.id
  AND (EXISTS(SELECT 1 FROM issue_records i WHERE i.project_id=p.id AND i.stage_id=s.id AND NOT i.archived)
   OR (NOT s.retired AND s.accepts_entries AND EXISTS(SELECT 1 FROM issue_type_workflows tw JOIN issue_types t ON t.id=tw.type_id JOIN workflows w ON w.id=tw.workflow_id WHERE tw.project_id=p.id AND tw.workflow_id=s.workflow_id AND tw.accepts_new AND NOT t.retired AND NOT w.retired)))
  AND NOT EXISTS(SELECT 1 FROM board_column_stages m JOIN board_records b ON b.id=m.board_id WHERE b.project_id=p.id AND b.is_default AND b.archived_at IS NULL AND m.stage_id=s.id)) AS missing_coverage,
 EXISTS(SELECT 1 FROM board_records b WHERE b.project_id=p.id AND b.is_default AND b.archived_at IS NULL AND b.saved_filters<>'{}'::jsonb) AS filtered_default
FROM projects p WHERE p.id=$1;

-- name: ConfigurationActivationWorkflows :many
SELECT w.id FROM workflows w WHERE w.project_id=$1 AND
 (EXISTS(SELECT 1 FROM issue_records i WHERE i.workflow_id=w.id AND NOT i.archived)
 OR EXISTS(SELECT 1 FROM issue_type_workflows b JOIN issue_types t ON t.id=b.type_id WHERE b.workflow_id=w.id AND b.accepts_new AND NOT t.retired))
ORDER BY w.id LIMIT 1001;

-- name: ConfigurationActivate :exec
UPDATE projects SET core_mode='modern',revision=revision+1,updated_at=now() WHERE id=$1;
