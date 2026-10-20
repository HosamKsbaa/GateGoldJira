-- +goose Up
ALTER TABLE personal_mcp_tokens ADD COLUMN kind text NOT NULL DEFAULT 'personal'
  CHECK (kind IN ('personal', 'oauth'));

CREATE TABLE mcp_oauth_authorizations (
  request_hash bytea PRIMARY KEY CHECK (octet_length(request_hash) = 32),
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 200),
  redirect_uri text NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  state text NOT NULL CHECK (char_length(state) BETWEEN 1 AND 1024),
  challenge text NOT NULL CHECK (char_length(challenge) = 43),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at timestamptz
);
CREATE INDEX mcp_oauth_authorizations_expiry ON mcp_oauth_authorizations(expires_at);

CREATE TABLE mcp_oauth_credentials (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES personal_mcp_tokens(id) ON DELETE RESTRICT,
  code_hash bytea UNIQUE CHECK (octet_length(code_hash) = 32),
  access_hash bytea UNIQUE CHECK (octet_length(access_hash) = 32),
  refresh_hash bytea UNIQUE CHECK (octet_length(refresh_hash) = 32),
  code_used boolean NOT NULL DEFAULT false,
  access_removed boolean NOT NULL DEFAULT false,
  refresh_used boolean NOT NULL DEFAULT false,
  access_expires_at timestamptz,
  metadata jsonb NOT NULL CHECK (
    metadata->>'Code' = '' AND metadata->>'Access' = '' AND metadata->>'Refresh' = ''
  ),
  CHECK ((code_hash IS NOT NULL AND access_hash IS NULL AND refresh_hash IS NULL)
    OR (code_hash IS NULL AND access_hash IS NOT NULL AND refresh_hash IS NOT NULL))
);
CREATE INDEX mcp_oauth_credentials_connection ON mcp_oauth_credentials(connection_id);

-- +goose Down
DROP TABLE mcp_oauth_credentials;
DROP TABLE mcp_oauth_authorizations;
-- Keep connection activity history; retired OAuth rows cannot authenticate as PATs.
UPDATE personal_mcp_tokens SET revoked_at = coalesce(revoked_at, now()) WHERE kind = 'oauth';
ALTER TABLE personal_mcp_tokens DROP COLUMN kind;
