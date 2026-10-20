package migrations_test

import (
	"context"
	"encoding/json"
	"fmt"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestIndependentBoardExpansionPreservesLegacyOrderLimitsAndContent(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 14); err != nil {
		t.Fatal(err)
	}
	actor, project, issue := uuid.New(), uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'board-expand@test.dev','board-expand@test.dev','Board migration',now(),true)", actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'RANK','Preserved board',$2)", project, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status,revision) SELECT $1,s,11 FROM unnest(ARRAY['todo','in_progress','review','done']) s", project); err != nil {
		t.Fatal(err)
	}
	flow := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{
			Status:         command.Todo,
			Name:           "Ready",
			AllowedTargets: []command.Status{command.InProgress},
		},
		{
			Status:         command.InProgress,
			Name:           "Doing",
			AllowedTargets: []command.Status{command.Review},
		},
		{
			Status:         command.Review,
			Name:           "مراجعة",
			WarningLimit:   new(int32(0)),
			AllowedTargets: []command.Status{command.Done},
		},
		{
			Status:         command.Done,
			Name:           "Done",
			AllowedTargets: []command.Status{command.Todo},
		},
	}}
	raw, err := json.Marshal(flow)
	if err != nil {
		t.Fatal(err)
	}
	boards := []uuid.UUID{uuid.New(), uuid.New()}
	for n, id := range boards {
		if _, err := pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,workflow,in_progress_limit,review_limit,archived_at) VALUES($1,$2,$3,$3,$4,$5,3,2,CASE WHEN $6 THEN now() END)", id, project, []string{"First", "Archived layout"}[n], actor, raw, n == 1); err != nil {
			t.Fatal(err)
		}
	}
	stamp := time.Date(2025, 3, 4, 10, 11, 12, 0, time.UTC)
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,status,rank,revision,created_at,updated_at) VALUES($1,$2,1,'مهمة محفوظة',$3,'in_progress',9007199254740993,7,$4,$4)", issue, project, actor, stamp); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	for _, id := range boards {
		var limit *int32
		var mode, name string
		var position, revision int64
		var column uuid.UUID
		if err := pool.QueryRow(ctx, "SELECT c.id,c.name,c.position,c.wip_limit,c.wip_mode,c.order_revision FROM board_columns c JOIN board_column_stages m ON m.column_id=c.id JOIN workflow_stages s ON s.id=m.stage_id WHERE c.board_id=$1 AND s.legacy_status='in_progress'", id).Scan(&column, &name, &position, &limit, &mode, &revision); err != nil {
			t.Fatal(err)
		}
		if name != "Doing" || position != 2 || limit == nil || *limit != 3 || mode != "warn" || revision != 11 {
			t.Fatal("legacy column changed", name, position, limit, mode, revision)
		}
		var rank int64
		var savedColumn uuid.UUID
		if err := pool.QueryRow(ctx, "SELECT column_id,rank FROM board_issue_ranks WHERE board_id=$1 AND issue_id=$2", id, issue).Scan(&savedColumn, &rank); err != nil || savedColumn != column || rank != 9007199254740993 {
			t.Fatal("legacy rank changed", rank, err)
		}
		if err := pool.QueryRow(ctx, "SELECT c.wip_limit FROM board_columns c JOIN board_column_stages m ON m.column_id=c.id JOIN workflow_stages s ON s.id=m.stage_id WHERE c.board_id=$1 AND s.legacy_status='review'", id).Scan(&limit); err != nil || limit != nil {
			t.Fatal("explicit unlimited override lost", limit, err)
		}
	}
	var rev int64
	var created, updated time.Time
	if err := pool.QueryRow(ctx, "SELECT revision,created_at,updated_at FROM issues WHERE id=$1", issue).Scan(&rev, &created, &updated); err != nil || rev != 7 || !created.Equal(stamp) || !updated.Equal(stamp) {
		t.Fatal("content rewritten", rev, created, updated, err)
	}
	var events int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&events); err != nil || events != 0 {
		t.Fatal("migration invented events", events, err)
	}
	// Independent ranks do not modify the other layout or issue content.
	if _, err := pool.Exec(ctx, "UPDATE board_issue_ranks SET rank=512 WHERE board_id=$1 AND issue_id=$2", boards[0], issue); err != nil {
		t.Fatal(err)
	}
	var other int64
	if err := pool.QueryRow(ctx, "SELECT rank FROM board_issue_ranks WHERE board_id=$1 AND issue_id=$2", boards[1], issue).Scan(&other); err != nil || other != 9007199254740993 {
		t.Fatal("ranks remain coupled", other, err)
	}
}

func TestIndependentBoardBackfillIsBoundedResumableAndHonorsLifecycleGuard(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 14); err != nil {
		t.Fatal(err)
	}
	actor, project, board := uuid.New(), uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'bounded-board@test.dev','bounded-board@test.dev','Batch owner',now(),true)", actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'BATCH','Batched ranks',$2)", project, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", project); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by) VALUES($1,$2,'Batched','batched',$3)", board, project, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank,revision) SELECT gen_random_uuid(),$1,n,'Preserved '||n,$2,n*1024,7 FROM generate_series(1,2050) n", project, actor); err != nil {
		t.Fatal(err)
	}
	if err := migrations.ApplyThrough(ctx, pool, 15); err != nil {
		t.Fatal(err)
	}
	var prepared int
	if err := pool.QueryRow(ctx, "SELECT backfill_legacy_board_layout(1)").Scan(&prepared); err != nil || prepared != 1 {
		t.Fatal("layout batch", prepared, err)
	}
	for _, query := range []string{
		"SELECT backfill_legacy_board_layout(26)",
		"SELECT backfill_legacy_board_ranks(1001)",
		"SELECT backfill_legacy_board_ranks(0)",
	} {
		if _, err := pool.Exec(ctx, query); err == nil {
			t.Fatal("unbounded batch accepted")
		}
	}
	held, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Rollback(ctx)
	if _, err = held.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||$1::text,0))", project.String()); err != nil {
		t.Fatal(err)
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	pid := conn.Conn().PgConn().PID()
	done := make(chan error, 1)
	completed := false
	operationCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer func() {
		cancel()
		_ = held.Rollback(context.Background())
		if !completed {
			<-done
		}
		conn.Release()
	}()
	go func() {
		var affected int
		err := conn.QueryRow(operationCtx, "SELECT backfill_legacy_board_ranks(1000)").Scan(&affected)
		if err == nil && affected != 1000 {
			err = fmt.Errorf("batch size %d", affected)
		}
		done <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	waiting := false
	for time.Now().Before(deadline) {
		if err := pool.QueryRow(ctx, "SELECT coalesce(wait_event='advisory',false) FROM pg_stat_activity WHERE pid=$1", pid).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !waiting {
		t.Fatal("backfill did not join the lifecycle guard")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM board_issue_ranks").Scan(&count); err != nil || count != 0 {
		t.Fatal("backfill bypassed held guard", count, err)
	}
	if err = held.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	err = <-done
	completed = true
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM board_issue_ranks").Scan(&count); err != nil || count != 1000 {
		t.Fatal("first batch not bounded", count, err)
	}
	// Simulate interruption by invoking the normal migration runner again.
	if err = migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM board_issue_ranks").Scan(&count); err != nil || count != 2050 {
		t.Fatal("resume lost ranks", count, err)
	}
	var pending int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM board_columns WHERE legacy_backfill_pending").Scan(&pending); err != nil || pending != 0 {
		t.Fatal("completion flag", pending, err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE revision<>7").Scan(&count); err != nil || count != 0 {
		t.Fatal("representation backfill edited content", count, err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal("completed backfill not replayable", err)
	}
}
