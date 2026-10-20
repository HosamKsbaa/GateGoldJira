package configuration

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"testing"
	"time"
)

func TestPreflightPreservesLegacyRowsAndRejectsDivergentActiveMoves(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 17); err != nil {
		t.Fatal(err)
	}
	admin := command.Actor{
		UserID:  command.NewID[command.UserKind](),
		Channel: command.REST,
		Today:   command.Today(time.Now(), time.UTC),
	}
	project := command.NewID[command.ProjectKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'admin@test.dev','admin@test.dev','Admin',now(),true)", admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'PREF','Preserved',$2)", project.UUID, admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	flow := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{
			Status:         command.Todo,
			Name:           "To do",
			AllowedTargets: []command.Status{command.Done},
		},
		{
			Status:         command.Done,
			Name:           "Done",
			AllowedTargets: []command.Status{command.Todo},
		},
	}}
	raw, _ := json.Marshal(flow)
	first, second := command.NewID[command.BoardKind](), command.NewID[command.BoardKind]()
	for i, id := range []command.BoardID{first, second} {
		if _, err := pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,workflow) VALUES($1,$2,$3,$3,$4,$5)", id.UUID, project.UUID, []string{"one", "two"}[i], admin.UserID.UUID, raw); err != nil {
			t.Fatal(err)
		}
	}
	service := New(command.Runner{Pool: pool}, nil)
	before, err := service.Inspect(ctx, admin, project)
	if err != nil || !before.Ready || before.LegacyBoards != 2 {
		t.Fatal("identical workflow preflight", before, err)
	}
	flow.Columns[0].AllowedTargets = []command.Status{}
	raw, _ = json.Marshal(flow)
	if _, err := pool.Exec(ctx, "UPDATE boards SET workflow=$2 WHERE id=$1", second.UUID, raw); err != nil {
		t.Fatal(err)
	}
	out, err := service.Inspect(ctx, admin, project)
	if err != nil || out.Ready || len(out.Problems) != 1 || out.Problems[0].Code != DifferentWorkflow {
		t.Fatal("divergence was silently accepted", out, err)
	}
	if _, err := pool.Exec(ctx, "UPDATE boards SET archived_at=now() WHERE id=$1", second.UUID); err != nil {
		t.Fatal(err)
	}
	out, err = service.Inspect(ctx, admin, project)
	if err != nil || !out.Ready || out.LegacyBoards != 2 {
		t.Fatal("archived history was dropped or enforced as active", out, err)
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&count); err != nil || count != 0 {
		t.Fatal("read-only preflight emitted changes", count, err)
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET is_administrator=false WHERE id=$1", admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Inspect(ctx, admin, project); err == nil {
		t.Fatal("preflight bypassed current admin access")
	}
}

func TestSameMovesIgnoresLayoutButNotMissingEdges(t *testing.T) {
	one := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{
			Status:         command.Todo,
			AllowedTargets: []command.Status{command.Review, command.Done},
		},
		{
			Status:         command.Done,
			AllowedTargets: []command.Status{command.Todo},
		},
	}}
	two := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{
			Status:         command.Done,
			Name:           "Finished",
			AllowedTargets: []command.Status{command.Todo},
		},
		{
			Status:         command.Todo,
			Name:           "Ready",
			AllowedTargets: []command.Status{command.Done, command.Review},
		},
	}}
	if !sameMoves(one, two) {
		t.Fatal("layout differences changed move comparison")
	}
	two.Columns[1].AllowedTargets = []command.Status{command.Done}
	if sameMoves(one, two) {
		t.Fatal("different moves compared equal")
	}
}
