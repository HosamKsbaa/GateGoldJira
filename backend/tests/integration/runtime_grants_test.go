package integration

import (
	"context"
	"os"
	"strings"
	"testing"

	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestRuntimeSQLGrantsAllowCurrentWorkButDenyHistoryDDLAndBusinessDeletion(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	name := "gg_test_role_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	role := pgx.Identifier{name}.Sanitize()
	if _, err := w.Pool.Exec(ctx, "CREATE ROLE "+role); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := w.Pool.Exec(context.Background(), "DROP OWNED BY "+role); err != nil {
			t.Error(err)
		}
		if _, err := w.Pool.Exec(context.Background(), "DROP ROLE "+role); err != nil {
			t.Error(err)
		}
	})
	raw, err := os.ReadFile("../../../infra/sql/runtime-grants.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "SELECT format(") {
			continue
		}
		query := strings.TrimSuffix(line, " \\gexec")
		query = strings.ReplaceAll(query, ":'runtime_db_user'", "'"+name+"'")
		var grant string
		if err := w.Pool.QueryRow(ctx, query).Scan(&grant); err != nil {
			t.Fatal(err)
		}
		if _, err := w.Pool.Exec(ctx, grant); err != nil {
			t.Fatal(err)
		}
	}
	checks := []struct {
		sql     string
		allowed bool
	}{
		{"SELECT * FROM personal_mcp_tokens LIMIT 1", true},
		{"INSERT INTO personal_mcp_tokens(id,user_id,name,token_hash,token_prefix,expires_at) VALUES('" + uuid.NewString() + "','" + w.Viewer.UserID.String() + "','Restricted runtime',decode(repeat('00',32),'hex'),'gg_mcp_12345678',now()+interval '7 days')", true},
		{"UPDATE personal_mcp_tokens SET last_used_at=now(),revoked_at=now() WHERE false", true},
		{"UPDATE personal_mcp_tokens SET user_id=user_id WHERE false", false},
		{"UPDATE personal_mcp_tokens SET token_hash=token_hash WHERE false", false},
		{"DELETE FROM personal_mcp_tokens WHERE false", false},
		{"SELECT * FROM personal_mcp_token_activity LIMIT 1", true},
		{"INSERT INTO personal_mcp_token_activity(id,token_id,tool_name) SELECT '" + uuid.NewString() + "',id,'get_me' FROM personal_mcp_tokens LIMIT 1", true},
		{"UPDATE personal_mcp_token_activity SET outcome='succeeded',error_code=NULL,resource_url=NULL,completed_at=now(),duration_ms=1 WHERE false", true},
		{"UPDATE personal_mcp_token_activity SET token_id=token_id WHERE false", false},
		{"UPDATE personal_mcp_token_activity SET tool_name=tool_name WHERE false", false},
		{"UPDATE personal_mcp_token_activity SET started_at=started_at WHERE false", false},
		{"DELETE FROM personal_mcp_token_activity WHERE false", false},
		{"SELECT * FROM mcp_oauth_credentials LIMIT 1", true},
		{"SELECT * FROM mcp_oauth_authorizations LIMIT 1", true},
		{"UPDATE mcp_oauth_credentials SET code_used=true,access_removed=true,refresh_used=true WHERE false", true},
		{"UPDATE mcp_oauth_credentials SET connection_id=connection_id WHERE false", false},
		{"UPDATE mcp_oauth_credentials SET metadata=metadata WHERE false", false},
		{"UPDATE mcp_oauth_authorizations SET consumed_at=now() WHERE false", true},
		{"UPDATE mcp_oauth_authorizations SET redirect_uri=redirect_uri WHERE false", false},
		{"SELECT * FROM issues LIMIT 1", true},
		{"SELECT * FROM board_columns LIMIT 1", true},
		{"SELECT * FROM board_column_stages LIMIT 1", true},
		{"SELECT * FROM board_issue_ranks LIMIT 1", true},
		{"SELECT backfill_legacy_board_layout(1)", false},
		{"SELECT backfill_legacy_board_ranks(1)", false},
		{"SELECT prepare_legacy_board_layout('" + uuid.NewString() + "')", false},
		{"UPDATE issues SET rank=rank WHERE id='" + w.Issue.String() + "'", true},
		{"SELECT * FROM attachments LIMIT 1", true},
		{"SELECT * FROM attachment_upload_reservations LIMIT 1", true},
		{"SELECT * FROM issue_links LIMIT 1", true},
		{"SELECT * FROM saved_issue_searches LIMIT 1", true},
		{"SELECT * FROM planning_completion_cycles LIMIT 1", true},
		{"SELECT * FROM planning_items LIMIT 1", true},
		{"SELECT * FROM issue_import_sources LIMIT 1", true},
		{"SELECT * FROM development_links LIMIT 1", true},
		{"SELECT * FROM project_assignment_rules LIMIT 1", true},
		{"SELECT * FROM notification_due_events LIMIT 1", true},
		{"SELECT * FROM notification_deliveries WHERE false FOR UPDATE", true},
		{"SELECT * FROM notification_preferences WHERE false FOR SHARE", true},
		{"UPDATE planning_items SET name=name,revision=revision+1,updated_at=now() WHERE false", true},
		{"UPDATE planning_issue SET epic_id=epic_id,release_id=release_id,revision=revision+1 WHERE false", true},
		{"UPDATE development_links SET title=title,removed=true,revision=revision+1 WHERE false", true},
		{"UPDATE project_assignment_rules SET enabled=false,assignee_id=assignee_id,revision=revision+1 WHERE false", true},
		{
			"UPDATE notification_preferences SET in_app_enabled=false,events=events,email_mode='off',due_reminders=false,revision=revision+1,updated_at=now() WHERE false",
			true,
		},
		{
			"UPDATE notification_deliveries SET state='cancelled',attempts=attempts+1,available_at=now(),completed_at=now() WHERE false",
			true,
		},
		{"UPDATE issue_import_sources SET source_key=source_key WHERE false", false},
		{"UPDATE development_links SET issue_id=issue_id WHERE false", false},
		{"UPDATE planning_items SET project_id=project_id WHERE false", false},
		{"UPDATE planning_issue SET issue_id=issue_id WHERE false", false},
		{"UPDATE notification_due_events SET event_id=event_id WHERE false", false},
		{"UPDATE notification_deliveries SET recipient_id=recipient_id WHERE false", false},
		{"DELETE FROM planning_items WHERE false", false},
		{"DELETE FROM issue_import_sources WHERE false", false},
		{"DELETE FROM development_links WHERE false", false},
		{"DELETE FROM project_assignment_rules WHERE false", false},
		{"DELETE FROM notification_due_events WHERE false", false},
		{"DELETE FROM notification_deliveries WHERE false", false},
		{
			"INSERT INTO issue_watchers(issue_id,user_id) VALUES('" + w.Issue.String() + "','" + w.Viewer.UserID.String() + "') ON CONFLICT(issue_id,user_id) DO UPDATE SET watching=true,updated_at=now()",
			true,
		},
		{
			"INSERT INTO saved_issue_searches(id,user_id,name,filters) VALUES('" + uuid.NewString() + "','" + w.Viewer.UserID.String() + "','Personal','{}') RETURNING *",
			true,
		},
		{
			"UPDATE saved_issue_searches SET name=name,filters=filters,revision=revision+1,removed=true,updated_at=now() WHERE false",
			true,
		},
		{"UPDATE issue_links SET removed_at=now() WHERE false", true},
		{"UPDATE compatible_attachments SET attached=false WHERE false", true},
		{"DELETE FROM upload_reservations WHERE false", true},
		{"DELETE FROM attachments WHERE false", false},
		{"DELETE FROM issue_links WHERE false", false},
		{"DELETE FROM issue_watchers WHERE false", false},
		{"DELETE FROM saved_issue_searches WHERE false", false},
		{"UPDATE issue_links SET kind='duplicates' WHERE false", false},
		{"UPDATE saved_issue_searches SET user_id=user_id WHERE false", false},
		{"UPDATE attachments SET filename='changed' WHERE false", false},
		{"SELECT singleton FROM company_settings FOR SHARE", true},
		{"UPDATE issues SET title=title WHERE id='" + w.Issue.String() + "'", true},
		{"DELETE FROM issue_labels WHERE false", true},
		{"DELETE FROM upload_reservations WHERE false", true},
		{"DELETE FROM idempotency_records WHERE false", true},
		{"DELETE FROM issues WHERE false", false},
		{"UPDATE comment_versions SET plain_text=plain_text WHERE false", false},
		{"UPDATE activity_events SET changes=changes WHERE false", false},
		{"DELETE FROM notifications WHERE false", false},
		{"UPDATE company_settings SET cleanup_paused=false", false},
		{"CREATE TABLE forbidden_schema_change(id integer)", false},
	}
	for _, check := range checks {
		tx, err := w.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(ctx, check.sql)
		tx.Rollback(ctx)
		if (err == nil) != check.allowed {
			t.Fatal("runtime grant mismatch", check.sql, err)
		}
	}
}
