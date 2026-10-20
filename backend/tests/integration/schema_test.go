package integration

import (
	"context"
	"errors"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestMigrationsAndHistoricalConstraints(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal("migrations not repeatable", err)
	}
	actor, project, other, issue := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO users (id,email,email_key,display_name,approved_at,is_administrator) VALUES ($1,'owner@example.test','owner@example.test','مالك',now(),true)", actor)
	if err != nil {
		t.Fatal(err)
	}
	for i, id := range []uuid.UUID{project, other} {
		key := []string{"GG", "OT"}[i]
		if _, err := pool.Exec(ctx, "INSERT INTO projects (id,key,name,created_by) VALUES ($1,$2,$3,$4)", id, key, "مشروع", actor); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues (id,project_id,number,title,reporter_id,rank) VALUES ($1,$2,1,'مهمة', $3,1024)", issue, project, actor); err != nil {
		t.Fatal(err)
	}
	violations := []struct {
		name, sql, code string
		args            []interface{}
	}{
		{
			"duplicate project key",
			"INSERT INTO projects (id,key,name,created_by) VALUES ($1,'GG','duplicate',$2)",
			"23505",
			[]interface{}{uuid.New(), actor},
		},
		{"immutable project key", "UPDATE projects SET key='NEW' WHERE id=$1", "23514", []interface{}{project}},
		{
			"subtask requires parent",
			"INSERT INTO issues (id,project_id,number,title,reporter_id,rank,type) VALUES ($1,$2,2,'child',$3,2048,'subtask')",
			"23514",
			[]interface{}{uuid.New(), project, actor},
		},
		{
			"cross project parent",
			"INSERT INTO issues (id,project_id,number,title,reporter_id,rank,type,parent_id) VALUES ($1,$2,2,'child',$3,2048,'subtask',$4)",
			"23503",
			[]interface{}{uuid.New(), other, actor, issue},
		},
		{"immutable reporter", "UPDATE issues SET number=99 WHERE id=$1", "23514", []interface{}{issue}},
		{"retained attribution", "DELETE FROM users WHERE id=$1", "23001", []interface{}{actor}},
		{
			"invalid WIP",
			"INSERT INTO boards (id,project_id,name,name_key,created_by,review_limit) VALUES ($1,$2,'Board','board',$3,0)",
			"23514",
			[]interface{}{uuid.New(), project, actor},
		},
	}
	for _, test := range violations {
		t.Run(test.name, func(t *testing.T) {
			_, err := pool.Exec(ctx, test.sql, test.args...)
			var databaseError *pgconn.PgError
			if !errors.As(err, &databaseError) || databaseError.Code != test.code {
				t.Fatalf("expected %s, got %v", test.code, err)
			}
		})
	}
	comment := uuid.New()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "INSERT INTO comments (id,project_id,issue_id,author_id) VALUES ($1,$2,$3,$4)", comment, project, issue, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO comment_versions (comment_id,revision,issue_id,safe_html,plain_text) VALUES ($1,1,$2,'<p dir=auto>مرحبا</p>','مرحبا')", comment, issue); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE comment_versions SET plain_text='changed' WHERE comment_id=$1", comment); err == nil {
		t.Fatal("historical comment version was mutable")
	}
	if _, err := pool.Exec(ctx, "INSERT INTO comments (id,project_id,issue_id,author_id) VALUES ($1,$2,$3,$4)", uuid.New(), project, issue, actor); err == nil {
		t.Fatal("comment committed without its version")
	}
}
