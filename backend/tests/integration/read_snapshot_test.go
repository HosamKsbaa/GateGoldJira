package integration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"testing"
)

func TestRepeatableReadRestartsAStaleProjectSnapshotAndReadsFreshState(t *testing.T) {
	f := workDatabase(t)
	ctx := context.Background()
	actor := command.Actor{UserID: f.actor, Channel: command.REST}
	attempts := 0
	resolve := func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		attempts++
		if attempts == 1 {
			if err := f.run(func(ctx context.Context, writer *command.Mutation) error {
				_, err := writer.Tx.Exec(ctx, "UPDATE projects SET name='After concurrent edit',revision=revision+1 WHERE id=$1", f.project.UUID)
				return err
			}); err != nil {
				return nil, err
			}
		}
		return []command.ProjectScope{{ProjectID: f.project}}, nil
	}
	result, err := command.ReadResolved(ctx, command.Runner{Pool: f.pool}, actor, command.Access{RepeatableRead: true}, resolve, func(ctx context.Context, m *command.Mutation) (string, error) {
		p, err := m.Queries.ReadProject(ctx, f.project.UUID)
		return p.Name, err
	})
	if err != nil || result != "After concurrent edit" || attempts != 2 {
		t.Fatal("stale snapshot was not safely restarted", result, attempts, err)
	}
}
