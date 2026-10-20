package integration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"testing"
	"time"
)

func TestLegacyMutationsParticipateInProjectLifecycleBeforeRowLocks(t *testing.T) {
	f := workDatabase(t)
	ctx := context.Background()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := dbgen.New(tx)
	if _, err = q.CompanySharedGuard(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = q.ProjectSharedLifecycle(ctx, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	finished := make(chan error, 1)
	go func() {
		finished <- f.run(func(ctx context.Context, m *command.Mutation) error {
			_, err := m.Queries.ReadProject(ctx, f.project.UUID)
			return err
		})
	}()
	select {
	case err := <-finished:
		t.Fatal("legacy writer bypassed held lifecycle guard", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("writer did not resume after lifecycle release")
	}
}
func TestProjectReadersWaitForExclusiveLifecycleAndCancelledReadsLeaveNoLocks(t *testing.T) {
	f := workDatabase(t)
	ctx := context.Background()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := dbgen.New(tx)
	if _, err = q.CompanySharedGuard(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = q.ProjectExclusiveLifecycle(ctx, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	readCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	_, err = command.Read(readCtx, command.Runner{Pool: f.pool}, command.Actor{UserID: f.actor, Channel: command.REST}, command.Access{Projects: []command.ProjectScope{{ProjectID: f.project}}}, func(ctx context.Context, m *command.Mutation) (bool, error) { return true, nil })
	if err == nil {
		t.Fatal("reader bypassed lifecycle")
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err = f.run(func(context.Context, *command.Mutation) error { return nil }); err != nil {
		t.Fatal("cancelled read left a guard", err)
	}
}
