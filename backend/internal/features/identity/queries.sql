-- name: ReadUser :one
SELECT * FROM users WHERE id = $1;

-- name: FindIdentity :one
SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id
WHERE i.issuer = $1 AND i.subject = $2;

-- name: ReadMembership :one
SELECT * FROM project_memberships WHERE project_id = $1 AND user_id = $2;

-- name: IdentityFindApprovedEmail :one
SELECT * FROM users WHERE email_key = $1 AND approved_at IS NOT NULL;

-- name: IdentityBind :exec
INSERT INTO user_identities(issuer,subject,user_id) VALUES($1,$2,$3);

-- name: IdentityCreateUser :one
INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator)
VALUES($1,$2,$3,$4,now(),$5) RETURNING *;

-- name: IdentityUpdateUser :one
UPDATE users SET email=sqlc.arg(email)::text,email_key=sqlc.arg(email_key)::text,display_name=sqlc.arg(display_name)::text,
 disabled_at=CASE WHEN sqlc.arg(active)::boolean THEN NULL ELSE coalesce(disabled_at,now()) END,
 is_administrator=sqlc.arg(is_administrator)::boolean,revision=revision+1,updated_at=now()
WHERE id=sqlc.arg(id)::uuid RETURNING *;

-- name: IdentityActiveAdminCount :one
SELECT count(*) FROM users WHERE approved_at IS NOT NULL AND disabled_at IS NULL AND is_administrator;

-- name: IdentityAssignedProjects :many
SELECT DISTINCT project_id FROM issues WHERE assignee_id=$1 ORDER BY project_id;

-- name: IdentityClearIneligibleAssignments :many
UPDATE issues SET assignee_id=NULL,revision=revision+1,updated_at=now()
WHERE issues.assignee_id=sqlc.arg(user_id)::uuid
 AND (sqlc.narg(project_id)::uuid IS NULL OR issues.project_id=sqlc.narg(project_id)::uuid)
 AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=sqlc.arg(user_id)::uuid AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.user_id=u.id AND m.project_id=issues.project_id AND m.removed_at IS NULL AND m.role IN('project_admin','member'))))
RETURNING issues.id,issues.project_id,issues.revision;

-- name: IdentityListUsers :many
SELECT * FROM users WHERE approved_at IS NOT NULL
 AND (NOT sqlc.arg(has_cursor)::boolean OR (display_name COLLATE "C",id) > (sqlc.arg(after_name)::text,sqlc.arg(after_id)::uuid))
ORDER BY display_name COLLATE "C",id LIMIT sqlc.arg(page_size)::integer;

-- name: IdentityCountUsers :one
SELECT count(*) FROM users WHERE approved_at IS NOT NULL;

-- name: IdentitySetMembership :one
INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)
ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role,removed_at=NULL,revision=project_memberships.revision+1,updated_at=now()
RETURNING *;

-- name: IdentityRemoveMembership :one
UPDATE project_memberships SET removed_at=now(),revision=revision+1,updated_at=now() WHERE project_id=$1 AND user_id=$2 RETURNING *;

-- name: IdentityListMemberships :many
SELECT m.*,u.display_name FROM project_memberships m JOIN users u ON u.id=m.user_id
WHERE m.project_id=sqlc.arg(project_id)::uuid AND (sqlc.arg(include_removed)::boolean OR m.removed_at IS NULL)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (u.display_name COLLATE "C",u.id) > (sqlc.arg(after_name)::text,sqlc.arg(after_id)::uuid))
ORDER BY u.display_name COLLATE "C",u.id LIMIT sqlc.arg(page_size)::integer;

-- name: IdentityCountMemberships :one
SELECT count(*) FROM project_memberships WHERE project_id=$1 AND (sqlc.arg(include_removed)::boolean OR removed_at IS NULL);

-- name: IdentityListCandidates :many
SELECT u.id,u.display_name FROM users u WHERE u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.user_id=u.id AND m.project_id=sqlc.arg(project_id)::uuid AND m.removed_at IS NULL AND (NOT sqlc.arg(assignees_only)::boolean OR m.role IN('project_admin','member'))))
 AND (sqlc.arg(query)::text='' OR strpos(lower(u.display_name),lower(sqlc.arg(query)::text))>0)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (u.display_name COLLATE "C",u.id) > (sqlc.arg(after_name)::text,sqlc.arg(after_id)::uuid))
ORDER BY u.display_name COLLATE "C",u.id LIMIT sqlc.arg(page_size)::integer;

-- name: IdentityCountCandidates :one
SELECT count(*) FROM users u WHERE u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.user_id=u.id AND m.project_id=sqlc.arg(project_id)::uuid AND m.removed_at IS NULL AND (NOT sqlc.arg(assignees_only)::boolean OR m.role IN('project_admin','member'))))
 AND (sqlc.arg(query)::text='' OR strpos(lower(u.display_name),lower(sqlc.arg(query)::text))>0);

-- name: IdentityMembershipCandidates :many
SELECT id,display_name,(disabled_at IS NULL)::boolean AS active FROM users WHERE approved_at IS NOT NULL
 AND (sqlc.arg(query)::text='' OR strpos(lower(display_name),lower(sqlc.arg(query)::text))>0)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (display_name COLLATE "C",id)>(sqlc.arg(after_name)::text COLLATE "C",sqlc.arg(after_id)::uuid))
ORDER BY display_name COLLATE "C",id LIMIT sqlc.arg(page_size)::integer;
-- name: IdentityMembershipCandidateCount :one
SELECT count(*) FROM users WHERE approved_at IS NOT NULL AND (sqlc.arg(query)::text='' OR strpos(lower(display_name),lower(sqlc.arg(query)::text))>0);
