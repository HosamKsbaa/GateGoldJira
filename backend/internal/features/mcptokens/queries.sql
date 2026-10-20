-- name: MCPTokenOwnerGuard :one
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- name: MCPTokenActiveCount :one
SELECT count(*) FROM personal_mcp_tokens
WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());

-- name: MCPTokenCreate :one
INSERT INTO personal_mcp_tokens (id, user_id, name, token_hash, token_prefix, created_at, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, token_prefix, created_at, expires_at, last_used_at, revoked_at, kind;

-- name: MCPTokenList :many
SELECT id, name, token_prefix, created_at, expires_at, last_used_at, revoked_at, kind
FROM personal_mcp_tokens WHERE user_id = $1
ORDER BY (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) DESC, created_at DESC, id DESC
LIMIT 100;

-- name: MCPTokenRevoke :one
UPDATE personal_mcp_tokens SET revoked_at = coalesce(revoked_at, now())
WHERE id = $1 AND user_id = $2
RETURNING id, name, token_prefix, created_at, expires_at, last_used_at, revoked_at, kind;

-- name: MCPTokenAuthenticate :one
UPDATE personal_mcp_tokens AS token SET last_used_at = now()
FROM users AS owner
WHERE token.token_hash = $1 AND token.kind = 'personal' AND token.revoked_at IS NULL AND (token.expires_at IS NULL OR token.expires_at > now())
  AND owner.id = token.user_id AND owner.approved_at IS NOT NULL AND owner.disabled_at IS NULL
RETURNING token.user_id, token.id;

-- name: MCPTokenOwned :one
SELECT id FROM personal_mcp_tokens WHERE id = $1 AND user_id = $2;

-- name: MCPTokenActivityStart :one
INSERT INTO personal_mcp_token_activity(id, token_id, tool_name)
SELECT $1, token.id, $2 FROM personal_mcp_tokens AS token
JOIN users AS owner ON owner.id = token.user_id
WHERE token.id = sqlc.arg('token_id') AND token.user_id = sqlc.arg('actor_user_id') AND token.revoked_at IS NULL
  AND (token.expires_at IS NULL OR token.expires_at > now())
  AND owner.approved_at IS NOT NULL AND owner.disabled_at IS NULL
RETURNING id;

-- name: MCPTokenActivityFinish :execrows
UPDATE personal_mcp_token_activity
SET outcome = $2, error_code = $3, resource_url = $4,
    completed_at = clock_timestamp(), duration_ms = $5
WHERE id = $1 AND outcome = 'started';

-- name: MCPTokenActivityPage :many
SELECT activity.id, activity.tool_name, activity.outcome, activity.error_code, activity.resource_url,
       activity.started_at, activity.completed_at, activity.duration_ms
FROM personal_mcp_token_activity AS activity
WHERE activity.token_id = $1
  AND (sqlc.narg('before_id')::uuid IS NULL OR (activity.started_at, activity.id) < (
    SELECT previous.started_at, previous.id FROM personal_mcp_token_activity AS previous
    WHERE previous.id = sqlc.narg('before_id')::uuid AND previous.token_id = $1
  ))
ORDER BY activity.started_at DESC, activity.id DESC LIMIT 26;

-- name: OAuthAuthorizationCreate :exec
INSERT INTO mcp_oauth_authorizations(request_hash, client_id, redirect_uri, state, challenge)
VALUES ($1,$2,$3,$4,$5);

-- name: OAuthAuthorizationRead :one
SELECT * FROM mcp_oauth_authorizations WHERE request_hash=$1 AND consumed_at IS NULL AND expires_at > now();

-- name: OAuthAuthorizationLock :one
SELECT * FROM mcp_oauth_authorizations WHERE request_hash=$1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE;

-- name: OAuthAuthorizationConsume :exec
UPDATE mcp_oauth_authorizations SET consumed_at=now() WHERE request_hash=$1;

-- name: OAuthConnectionCreate :one
INSERT INTO personal_mcp_tokens(id,user_id,name,token_hash,token_prefix,kind)
VALUES($1,$2,'Antigravity (browser login)',$3,'Browser OAuth  ','oauth')
RETURNING id;

-- name: OAuthCredentialCreate :exec
INSERT INTO mcp_oauth_credentials(id,connection_id,code_hash,access_hash,refresh_hash,access_expires_at,metadata)
VALUES($1,$2,$3,$4,$5,$6,$7);

-- name: OAuthCredentialByCode :one
SELECT credential.* FROM mcp_oauth_credentials credential
JOIN personal_mcp_tokens connection ON connection.id=credential.connection_id
JOIN users owner ON owner.id=connection.user_id
WHERE credential.code_hash=$1 AND connection.revoked_at IS NULL
 AND owner.disabled_at IS NULL AND owner.approved_at IS NOT NULL
FOR UPDATE OF credential;

-- name: OAuthCredentialByRefresh :one
SELECT credential.* FROM mcp_oauth_credentials credential
JOIN personal_mcp_tokens connection ON connection.id=credential.connection_id
JOIN users owner ON owner.id=connection.user_id
WHERE credential.refresh_hash=$1 AND connection.revoked_at IS NULL
 AND owner.disabled_at IS NULL AND owner.approved_at IS NOT NULL
FOR UPDATE OF credential;

-- name: OAuthCodeConsume :exec
UPDATE mcp_oauth_credentials SET code_used=true WHERE code_hash=$1;

-- name: OAuthAccessRemove :exec
UPDATE mcp_oauth_credentials SET access_removed=true WHERE id=$1;

-- name: OAuthRefreshConsume :exec
UPDATE mcp_oauth_credentials SET refresh_used=true WHERE refresh_hash=$1;

-- name: OAuthAccessAuthenticate :one
UPDATE personal_mcp_tokens connection SET last_used_at=now()
FROM mcp_oauth_credentials credential, users owner
WHERE credential.access_hash=$1 AND credential.access_removed=false AND credential.access_expires_at > now()
 AND connection.id=credential.connection_id AND connection.kind='oauth' AND connection.revoked_at IS NULL
 AND owner.id=connection.user_id AND owner.approved_at IS NOT NULL AND owner.disabled_at IS NULL
RETURNING connection.user_id, connection.id;

-- name: OAuthReplayRevoke :exec
UPDATE personal_mcp_tokens connection SET revoked_at=coalesce(revoked_at,now())
FROM mcp_oauth_credentials credential
WHERE credential.refresh_hash=$1 AND credential.refresh_used=true AND credential.connection_id=connection.id;

-- name: OAuthCredentialRevoke :exec
UPDATE personal_mcp_tokens connection SET revoked_at=coalesce(revoked_at,now())
FROM mcp_oauth_credentials credential
WHERE (credential.refresh_hash=$1 OR credential.access_hash=$1)
 AND credential.connection_id=connection.id AND connection.kind='oauth';
