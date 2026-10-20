package migrations_test

import (
	"context"
	"gategoldjira/backend/db/migrations"
	"testing"
)

func TestRetirementHasCanonicalTablesAndReadOnlyMigrationEvidence(t *testing.T) {
	f := legacyAssetsAt(t, 13, false)
	ctx := context.Background()
	if err := migrations.Apply(ctx, f.pool); err != nil {
		t.Fatal(err)
	}
	var count int
	// Forty-four business tables plus account credentials, activity and two OAuth protocol tables.
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'goose_db_version'").Scan(&count); err != nil || count != 48 {
		t.Fatal("physical inventory", count, err)
	}
	var tokens bool
	if err := f.pool.QueryRow(ctx, "SELECT to_regclass('public.personal_mcp_tokens') IS NOT NULL").Scan(&tokens); err != nil || !tokens {
		t.Fatal("account credential store missing", err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='issue_records' AND column_name IN('status','type','priority','rank')) OR (table_name='board_records' AND column_name IN('workflow','in_progress_limit','review_limit')) OR (table_name='assignment_rule_records' AND column_name='stage'))").Scan(&count); err != nil || count != 0 {
		t.Fatal("mutable duplicate storage remains", count, err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issue_records SET legacy_rank=1 WHERE id=$1", f.issue); err == nil {
		t.Fatal("migration evidence was mutable")
	}
	var before string
	if err := f.pool.QueryRow(ctx, "SELECT to_jsonb(i)::text FROM issues i WHERE id=$1", f.issue).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, f.pool); err != nil {
		t.Fatal("restart", err)
	}
	var after string
	if err := f.pool.QueryRow(ctx, "SELECT to_jsonb(i)::text FROM issues i WHERE id=$1", f.issue).Scan(&after); err != nil || after != before {
		t.Fatal("restart changed issue", err)
	}
}
