-- +goose Up
ALTER TABLE personal_mcp_tokens DROP CONSTRAINT personal_mcp_tokens_check;
ALTER TABLE personal_mcp_tokens ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE personal_mcp_tokens ADD CONSTRAINT personal_mcp_tokens_expiry
  CHECK (expires_at IS NULL OR expires_at > created_at);
-- Preserve working credentials, without reactivating expired or revoked tokens.
UPDATE personal_mcp_tokens SET expires_at = NULL
WHERE revoked_at IS NULL AND expires_at > now();

CREATE TABLE personal_mcp_token_activity (
  id uuid PRIMARY KEY,
  token_id uuid NOT NULL REFERENCES personal_mcp_tokens(id) ON DELETE RESTRICT,
  tool_name text NOT NULL CHECK (char_length(tool_name) BETWEEN 1 AND 100),
  outcome text NOT NULL DEFAULT 'started' CHECK (outcome IN ('started', 'succeeded', 'failed')),
  error_code text CHECK (char_length(error_code) BETWEEN 1 AND 80),
  resource_url text CHECK (char_length(resource_url) BETWEEN 1 AND 2048),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  duration_ms bigint CHECK (duration_ms >= 0),
  CHECK ((outcome = 'started' AND completed_at IS NULL AND duration_ms IS NULL)
    OR (outcome <> 'started' AND completed_at IS NOT NULL AND duration_ms IS NOT NULL))
);
CREATE INDEX personal_mcp_token_activity_page
  ON personal_mcp_token_activity(token_id, started_at DESC, id DESC);

-- +goose Down
DROP TABLE personal_mcp_token_activity;
UPDATE personal_mcp_tokens SET expires_at = created_at + interval '2160 hours'
WHERE expires_at IS NULL OR expires_at > created_at + interval '2160 hours';
ALTER TABLE personal_mcp_tokens DROP CONSTRAINT personal_mcp_tokens_expiry;
ALTER TABLE personal_mcp_tokens ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE personal_mcp_tokens ADD CONSTRAINT personal_mcp_tokens_check
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '2160 hours');
