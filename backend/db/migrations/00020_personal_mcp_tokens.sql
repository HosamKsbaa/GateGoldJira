-- +goose Up
CREATE TABLE personal_mcp_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  token_prefix text NOT NULL CHECK (char_length(token_prefix) = 15),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '2160 hours')
);
CREATE INDEX personal_mcp_tokens_owner ON personal_mcp_tokens(user_id, created_at DESC);

-- +goose Down
DROP TABLE personal_mcp_tokens;
