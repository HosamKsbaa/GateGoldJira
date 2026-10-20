-- name: IssuesApprovalTransition :one
SELECT sqlc.embed(t),w.revision AS workflow_revision,p.configuration_revision
FROM workflow_transitions t JOIN workflows w ON w.id=t.workflow_id JOIN projects p ON p.id=t.project_id
WHERE t.project_id=$1 AND t.id=$2;

-- name: IssuesApprovalVotes :many
SELECT a.*,u.display_name,
(u.approved_at IS NOT NULL AND u.disabled_at IS NULL AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships member WHERE member.project_id=a.project_id AND member.user_id=a.approver_id AND member.removed_at IS NULL AND member.role IN('member','project_admin'))))::boolean AS eligible_member,
(u.approved_at IS NOT NULL AND u.disabled_at IS NULL AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships member WHERE member.project_id=a.project_id AND member.user_id=a.approver_id AND member.removed_at IS NULL AND member.role='project_admin')))::boolean AS eligible_admin
FROM issue_approvals a JOIN users u ON u.id=a.approver_id
WHERE a.issue_id=sqlc.arg(issue_id) AND a.transition_id=sqlc.arg(transition_id)
AND (NOT sqlc.arg(has_cursor)::boolean OR (a.decided_at,a.approver_id,a.issue_revision,a.workflow_revision,a.configuration_revision)<(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_user)::uuid,sqlc.arg(after_issue_revision)::bigint,sqlc.arg(after_workflow_revision)::bigint,sqlc.arg(after_configuration_revision)::bigint))
ORDER BY a.decided_at DESC,a.approver_id DESC,a.issue_revision DESC,a.workflow_revision DESC,a.configuration_revision DESC LIMIT sqlc.arg(page_size)::integer;

-- name: IssuesApprovalVoteCount :one
SELECT count(*) FROM issue_approvals WHERE issue_id=$1 AND transition_id=$2;

-- name: IssuesCurrentApprovalVotes :many
SELECT a.*,u.display_name FROM issue_approvals a JOIN users u ON u.id=a.approver_id
WHERE a.issue_id=$1 AND a.transition_id=$2 AND a.issue_revision=$3 AND a.workflow_revision=$4 AND a.configuration_revision=$5
AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
AND (NOT sqlc.arg(exclude_reporter)::boolean OR a.approver_id<>sqlc.arg(reporter_id)::uuid)
AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships member WHERE member.project_id=a.project_id AND member.user_id=a.approver_id AND member.removed_at IS NULL
AND (member.role='project_admin' OR (sqlc.arg(approver_role)::text='member' AND member.role='member'))));

-- name: IssuesExistingApprovalVote :one
SELECT * FROM issue_approvals WHERE issue_id=$1 AND transition_id=$2 AND issue_revision=$3 AND workflow_revision=$4 AND configuration_revision=$5 AND approver_id=$6;

-- name: IssuesInsertApprovalVote :exec
INSERT INTO issue_approvals(project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,approver_id,decision)
VALUES($1,$2,$3,$4,$5,$6,$7,$8);

-- name: IssuesTransitionRequiredFields :many
SELECT r.system_field,r.field_id FROM transition_required_fields r WHERE r.transition_id=$1 ORDER BY r.id;

-- name: IssuesAvailableReviewCounts :many
SELECT t.id AS transition_id,
 count(a.approver_id) FILTER(WHERE a.decision='approve')::integer AS approved,
 coalesce(bool_or(a.decision='reject'),false)::boolean AS rejected,
 w.revision AS workflow_revision,p.configuration_revision
FROM workflow_transitions t JOIN workflows w ON w.id=t.workflow_id JOIN projects p ON p.id=t.project_id
LEFT JOIN issue_approvals a ON a.transition_id=t.id AND a.issue_id=sqlc.arg(issue_id)::uuid
 AND a.issue_revision=sqlc.arg(issue_revision)::bigint AND a.workflow_revision=w.revision AND a.configuration_revision=p.configuration_revision
 AND (NOT t.exclude_issue_reporter OR a.approver_id<>sqlc.arg(reporter_id)::uuid)
 AND EXISTS(SELECT 1 FROM users u WHERE u.id=a.approver_id AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships member WHERE member.user_id=u.id AND member.project_id=t.project_id AND member.removed_at IS NULL
 AND (member.role='project_admin' OR (t.approver_role='member' AND member.role='member')))))
WHERE t.project_id=sqlc.arg(project_id)::uuid AND t.workflow_id=sqlc.arg(workflow_id)::uuid
 AND t.from_stage_id=sqlc.arg(stage_id)::uuid AND NOT t.retired
GROUP BY t.id,w.revision,p.configuration_revision;
