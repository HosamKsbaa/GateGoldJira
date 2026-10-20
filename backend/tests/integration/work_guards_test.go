package integration

import (
	"context"
	"errors"
	"math"
	"sync"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type workFixture struct {
	pool    *pgxpool.Pool
	actor   command.UserID
	project command.ProjectID
	number  int64
}

func workDatabase(t *testing.T) *workFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	fixture := &workFixture{
		pool:    pool,
		actor:   command.NewID[command.UserKind](),
		project: command.NewID[command.ProjectKind](),
	}
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'owner@example.test','owner@example.test','Owner',now(),true)", fixture.actor.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Project',$2)", fixture.project.UUID, fixture.actor.UUID); err != nil {
		t.Fatal(err)
	}
	for _, status := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) VALUES($1,$2)", fixture.project.UUID, string(status)); err != nil {
			t.Fatal(err)
		}
	}
	return fixture
}
func (fixture *workFixture) issue(t *testing.T, parent *command.IssueID, status command.Status, rank int64) command.IssueID {
	t.Helper()
	fixture.number++
	id := command.NewID[command.IssueKind]()
	kind := "task"
	var parentUUID *uuid.UUID
	if parent != nil {
		kind = "subtask"
		parentUUID = &parent.UUID
	}
	if _, err := fixture.pool.Exec(context.Background(), "INSERT INTO issues(id,project_id,number,title,reporter_id,status,rank,type,parent_id) VALUES($1,$2,$3,'Work',$4,$5,$6,$7,$8)", id.UUID, fixture.project.UUID, fixture.number, fixture.actor.UUID, string(status), rank, kind, parentUUID); err != nil {
		t.Fatal(err)
	}
	return id
}
func (fixture *workFixture) run(apply func(context.Context, *command.Mutation) error) error {
	request := command.MutationRequest{
		Actor: command.Actor{
			UserID:  fixture.actor,
			Channel: command.REST,
		},
		Operation:      command.UpdateIssue,
		RetryReference: uuid.NewString(),
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: fixture.project, Write: true}}},
	}
	_, err := command.Execute(context.Background(), command.Runner{Pool: fixture.pool}, request, struct{}{}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, mutation *command.Mutation, _ struct{}) (bool, error) {
		return true, apply(ctx, mutation)
	}, func(bool) error { return nil })
	return err
}

func TestCombinedGraphCompletionAndParentRules(t *testing.T) {
	fixture := workDatabase(t)
	ctx := context.Background()
	parent := fixture.issue(t, nil, command.Todo, 1024)
	child := fixture.issue(t, &parent, command.Todo, 2048)
	blocker := fixture.issue(t, nil, command.Todo, 3072)
	if _, err := fixture.pool.Exec(ctx, "INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4)", fixture.project.UUID, parent.UUID, blocker.UUID, fixture.actor.UUID); err != nil {
		t.Fatal(err)
	}
	err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckCompletion(ctx, mutation, fixture.project, parent)
	})
	var guard *issues.GuardError
	if !errors.As(err, &guard) || len(guard.Work) != 2 {
		t.Fatal("completion failed to expose both blocker and child", err)
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckDependency(ctx, mutation, fixture.project, child, parent)
	}); err == nil {
		t.Fatal("combined parent/dependency cycle accepted")
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckChildCreation(ctx, mutation, fixture.project, child)
	}); err == nil {
		t.Fatal("nested subtask accepted")
	}
	if _, err := fixture.pool.Exec(ctx, "UPDATE issues SET status='done' WHERE id=ANY($1::uuid[])", []uuid.UUID{child.UUID, blocker.UUID}); err != nil {
		t.Fatal(err)
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckCompletion(ctx, mutation, fixture.project, parent)
	}); err != nil {
		t.Fatal("completed prerequisites still block", err)
	}
	if _, err := fixture.pool.Exec(ctx, "UPDATE issues SET status='done' WHERE id=$1", parent.UUID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckReopen(ctx, mutation, fixture.project, child)
	}); err == nil {
		t.Fatal("child reopened under Done parent")
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		return issues.CheckChildCreation(ctx, mutation, fixture.project, parent)
	}); err == nil {
		t.Fatal("child created under Done parent")
	}
}

func TestParentDoneRacesChildReopen(t *testing.T) {
	fixture := workDatabase(t)
	parent := fixture.issue(t, nil, command.Todo, 1024)
	child := fixture.issue(t, &parent, command.Done, 1024)
	var wait sync.WaitGroup
	results := make(chan error, 2)
	wait.Add(2)
	go func() {
		defer wait.Done()
		results <- fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
			if err := issues.CheckCompletion(ctx, mutation, fixture.project, parent); err != nil {
				return err
			}
			_, err := mutation.Tx.Exec(ctx, "UPDATE issues SET status='done' WHERE id=$1", parent.UUID)
			return err
		})
	}()
	go func() {
		defer wait.Done()
		results <- fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
			if err := issues.CheckReopen(ctx, mutation, fixture.project, child); err != nil {
				return err
			}
			_, err := mutation.Tx.Exec(ctx, "UPDATE issues SET status='todo' WHERE id=$1", child.UUID)
			return err
		})
	}()
	wait.Wait()
	close(results)
	successful := 0
	for err := range results {
		if err == nil {
			successful++
		}
	}
	if successful != 1 {
		t.Fatalf("race had %d successful outcomes", successful)
	}
	var invalid bool
	if err := fixture.pool.QueryRow(context.Background(), "SELECT p.status='done' AND c.status<>'done' FROM issues p JOIN issues c ON c.parent_id=p.id WHERE c.id=$1", child.UUID).Scan(&invalid); err != nil || invalid {
		t.Fatal("race left Done parent with unfinished child")
	}
}

func TestRankRebalancePreservesHiddenOrderAndOtherRevisions(t *testing.T) {
	fixture := workDatabase(t)
	hidden := fixture.issue(t, nil, command.Todo, 1)
	visible := fixture.issue(t, nil, command.Todo, 2)
	moving := fixture.issue(t, nil, command.Todo, 3)
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		rank, err := issues.NeighborRank(ctx, mutation, fixture.project, moving, visible, true)
		if err != nil {
			return err
		}
		if _, err := mutation.Tx.Exec(ctx, "UPDATE issues SET rank=$2,revision=revision+1 WHERE id=$1", moving.UUID, rank); err != nil {
			return err
		}
		_, err = issues.AdvanceOrder(ctx, mutation, fixture.project, command.Todo)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	rows, err := fixture.pool.Query(context.Background(), "SELECT id,revision FROM issues ORDER BY rank,number")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		var revision int64
		if err := rows.Scan(&id, &revision); err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
		if id != moving.UUID && revision != 1 {
			t.Fatal("rebalance changed unrelated content revision")
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0] != hidden.UUID || got[1] != moving.UUID || got[2] != visible.UUID {
		t.Fatal("hidden-card relative order changed")
	}
	if _, err := fixture.pool.Exec(context.Background(), "UPDATE issues SET rank=$2 WHERE id=$1", visible.UUID, int64(math.MaxInt64)); err != nil {
		t.Fatal(err)
	}
	if err := fixture.run(func(ctx context.Context, mutation *command.Mutation) error {
		rank, err := issues.NeighborRank(ctx, mutation, fixture.project, moving, visible, false)
		if err == nil && rank <= 0 {
			return errors.New("rank overflowed")
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
}
