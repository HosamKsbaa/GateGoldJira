package migrations_test

import (
	"context"
	"errors"
	"fmt"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"reflect"
	"strings"
	"testing"
	"time"
)

type sourceSnapshot struct {
	Table   string
	Columns []string
	Rows    []string
}

// JSON is only a lossless database-test boundary here. Never decode large
// integral identities into float values, and never log row contents.
func snapshotOriginalColumns(t *testing.T, pool *pgxpool.Pool, shape []sourceSnapshot) []sourceSnapshot {
	t.Helper()
	ctx := context.Background()
	if shape == nil {
		rows, err := pool.Query(ctx, "SELECT table_name,array_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN(SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AND table_name<>'goose_db_version' GROUP BY table_name ORDER BY table_name")
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			item := sourceSnapshot{}
			if err = rows.Scan(&item.Table, &item.Columns); err != nil {
				t.Fatal(err)
			}
			shape = append(shape, item)
		}
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
	}
	result := make([]sourceSnapshot, 0, len(shape))
	for _, table := range shape {
		columns := []string{}
		for _, name := range table.Columns {
			columns = append(columns, pgx.Identifier{name}.Sanitize())
		}
		query := "SELECT to_jsonb(original)::text FROM (SELECT " + strings.Join(columns, ",") + " FROM " + pgx.Identifier{table.Table}.Sanitize() + ") original ORDER BY to_jsonb(original)::text"
		rows, err := pool.Query(ctx, query)
		if err != nil {
			t.Fatal("source projection", table.Table, err)
		}
		item := sourceSnapshot{Table: table.Table, Columns: table.Columns, Rows: []string{}}
		for rows.Next() {
			var value string
			if err = rows.Scan(&value); err != nil {
				t.Fatal(err)
			}
			item.Rows = append(item.Rows, value)
		}
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
		result = append(result, item)
	}
	return result
}
func TestFullPopulatedExpansionPreservesEveryOriginalColumnAndResumes(t *testing.T) {
	f := legacyAssetsAt(t, 10, false)
	ctx := context.Background()
	pool := f.pool
	seed := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal("seed", err)
		}
	}
	seed("INSERT INTO project_status_order(project_id,status,revision) SELECT $1,unnest(ARRAY['in_progress','review','done']),7 ON CONFLICT DO NOTHING", f.project)
	recipient := uuid.New()
	seed("INSERT INTO users(id,email,email_key,display_name,approved_at) VALUES($1,'recipient@migration.test','recipient@migration.test','Recipient',now())", recipient)
	board, label, child, blocker, epic, release, event := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	seed("INSERT INTO boards(id,project_id,name,name_key,created_by,is_default) VALUES($1,$2,'All Issues','all issues',$3,true)", board, f.project, f.actor)
	seed("INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,'عاجل','عاجل',$3)", label, f.project, f.actor)
	seed("INSERT INTO issues(id,project_id,number,title,description,description_format,type,parent_id,reporter_id,assignee_id,due_date,rank,backlog_rank) VALUES($1,$2,2,'مهمة فرعية','<p dir=\"rtl\">تفاصيل محفوظة</p>','html','subtask',$3,$4,$4,'2026-12-10',2048,4096)", child, f.project, f.issue, f.actor)
	seed("INSERT INTO issues(id,project_id,number,title,reporter_id,rank,backlog,backlog_rank) VALUES($1,$2,3,'Blocker',$3,3072,true,5120)", blocker, f.project, f.actor)
	seed("INSERT INTO issue_labels(project_id,issue_id,label_id) VALUES($1,$2,$3)", f.project, f.issue, label)
	seed("INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4)", f.project, child, blocker, f.actor)
	seed("INSERT INTO issue_watchers(issue_id,user_id) VALUES($1,$2)", f.issue, f.actor)
	seed("INSERT INTO issue_links(issue_id,target_id,kind,created_by) VALUES($1,$2,'relates_to',$3)", f.issue, blocker, f.actor)
	seed("INSERT INTO saved_issue_searches(id,user_id,name,filters) VALUES($1,$2,'بحث عربي','{\"statuses\":[\"todo\"],\"query\":\"نسخة\"}')", uuid.New(), f.actor)
	for i, id := range []uuid.UUID{epic, release} {
		seed("INSERT INTO planning_items(id,project_id,kind,name,description,created_by,target_date) VALUES($1,$2,$3,$4,'وصف الخطة',$5,'2027-01-01')", id, f.project, []string{"epic", "release"}[i], fmt.Sprintf("Planning %d", i), f.actor)
	}
	seed("INSERT INTO planning_issue(issue_id,project_id,epic_id,release_id,revision) VALUES($1,$2,$3,$4,5)", f.issue, f.project, epic, release)
	seed("INSERT INTO issue_import_sources(project_id,source_key,issue_id) VALUES($1,'original-source',$2)", f.project, f.issue)
	seed("INSERT INTO development_links(id,issue_id,url,title,kind,created_by) VALUES($1,$2,'https://example.test/pull/1','Original pull request','pull_request',$3)", uuid.New(), f.issue, f.actor)
	seed("INSERT INTO project_assignment_rules(id,project_id,name,stage,assignee_id,created_by) VALUES($1,$2,'Original rule','todo',$3,$3)", uuid.New(), f.project, f.actor)
	seed("INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes,created_at) VALUES($1,$2,'web','update_issue','issue',$3,$4,$3,'{\"fields\":[{\"field\":\"status\",\"before\":\"in_progress\",\"after\":\"review\"}]}','2001-01-01')", event, f.actor, f.issue, f.project)
	seed("INSERT INTO notifications(id,recipient_id,event_id,project_id,issue_id,actor_id,reasons,plain_text_summary,revision) VALUES($1,$2,$3,$4,$5,$6,ARRAY['watching'],'إشعار محفوظ',9)", uuid.New(), recipient, event, f.project, f.issue, f.actor)
	before := snapshotOriginalColumns(t, pool, nil)
	if err := migrations.ApplyThrough(ctx, pool, 17); err != nil {
		t.Fatal(err)
	}
	// Simulate an interrupted owner batch before the normal runner resumes it.
	var count int
	if err := pool.QueryRow(ctx, "SELECT backfill_legacy_assets(1)").Scan(&count); err != nil || count != 1 {
		t.Fatal("bounded asset batch", count, err)
	}
	if err := migrations.Expand(ctx, pool); err != nil {
		t.Fatal(err)
	}
	after := snapshotOriginalColumns(t, pool, before)
	for i, original := range before {
		if !reflect.DeepEqual(original.Rows, after[i].Rows) {
			t.Fatal("expansion changed original data", original.Table)
		}
	}
	if err := migrations.Expand(ctx, pool); err != nil {
		t.Fatal("restart", err)
	}
	again := snapshotOriginalColumns(t, pool, before)
	if !reflect.DeepEqual(after, again) {
		t.Fatal("repeated migration changed preserved columns")
	}
	var refs int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM comment_version_attachments WHERE comment_id=$1", f.comment).Scan(&refs); err != nil || refs != 2 {
		t.Fatal("historical references", refs, err)
	}
	var incomplete int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE type_id IS NULL OR priority_id IS NULL OR workflow_id IS NULL OR stage_id IS NULL").Scan(&incomplete); err != nil || incomplete != 0 {
		t.Fatal("incomplete canonical references", incomplete, err)
	}
	t.Logf("Preserved %d original table projections across bounded migration and restart", len(before))
}

func TestAcceptedLegacySaveReplaysAcrossCanonicalExpansion(t *testing.T) {
	f := legacyAssetsAt(t, 13, false)
	ctx := context.Background()
	actor := command.Actor{
		UserID:  command.UserID{UUID: f.actor},
		Channel: command.REST,
		Today:   command.Today(time.Now(), time.UTC),
	}
	service := issues.New(command.Runner{Pool: f.pool}, nil)
	current, err := service.Get(ctx, actor, command.IssueID{UUID: f.issue})
	if err != nil {
		t.Fatal("legacy source read", err, errors.Unwrap(err))
	}
	input := issues.UpdateInput{
		IssueID:          current.Summary.ID,
		ExpectedRevision: current.Summary.Revision,
		Editable: issues.IssueEditable{
			Title:             "تعديل محفوظ",
			Description:       "Original accepted save",
			DescriptionFormat: command.PlainDescription,
			Type:              current.Summary.Type,
			Priority:          current.Summary.Priority,
			LabelIDs:          []command.LabelID{},
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := service.Update(ctx, actor, input)
	if err != nil {
		t.Fatal("legacy source save", err)
	}
	if err = migrations.Apply(ctx, f.pool); err != nil {
		t.Fatal(err)
	}
	actor.Channel = command.MCP
	restarted := issues.New(command.Runner{Pool: f.pool}, nil)
	replay, err := restarted.Update(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || !reflect.DeepEqual(saved.Body.Result, replay.Body.Result) || !reflect.DeepEqual(saved.Body.Receipt.EventID, replay.Body.Receipt.EventID) {
		t.Fatal("accepted legacy save changed across expansion", err)
	}
	var events int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE action='update_issue'").Scan(&events); err != nil || events != 1 {
		t.Fatal("replay duplicated business change", events, err)
	}
}
