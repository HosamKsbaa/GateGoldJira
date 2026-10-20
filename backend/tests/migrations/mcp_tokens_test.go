package migrations_test

import (
	"context"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestPermanentMCPTokenMigrationPreservesCredentialsAndInactiveState(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.ApplyThrough(ctx, pool, 20); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at) VALUES($1,'token@test.dev','token@test.dev','Owner',now())", owner); err != nil {
		t.Fatal(err)
	}
	for index, state := range []string{"active", "expired", "revoked"} {
		_, err := pool.Exec(ctx, `INSERT INTO personal_mcp_tokens(id,user_id,name,token_hash,token_prefix,created_at,expires_at,revoked_at)
VALUES($1,$2,$3,decode(repeat($4,32),'hex'),'gg_mcp_12345678',now()-interval '31 days',
CASE WHEN $3='expired' THEN now()-interval '1 hour' ELSE now()+interval '1 day' END,
CASE WHEN $3='revoked' THEN now() ELSE NULL END)`, uuid.New(), owner, state, []string{"01", "02", "03"}[index])
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var preserved bool
	if err := pool.QueryRow(ctx, `SELECT count(*)=3 AND bool_and(
  CASE name WHEN 'active' THEN expires_at IS NULL AND revoked_at IS NULL AND token_hash=decode(repeat('01',32),'hex')
    WHEN 'expired' THEN expires_at < now() AND revoked_at IS NULL
    WHEN 'revoked' THEN revoked_at IS NOT NULL AND expires_at IS NOT NULL ELSE false END)
FROM personal_mcp_tokens WHERE user_id=$1`, owner).Scan(&preserved); err != nil || !preserved {
		t.Fatal("migration changed credential identity or reactivated inactive tokens", err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal("restart", err)
	}
}
