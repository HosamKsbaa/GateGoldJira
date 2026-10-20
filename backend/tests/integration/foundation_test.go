package integration

import (
	"context"
	"sync"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestCompanyGuardPrecedesRetryAndSortedProjectLocks(t *testing.T) {
	fixture := workDatabase(t)
	ctx := context.Background()
	second := command.NewID[command.ProjectKind]()
	if _, err := fixture.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'ZZ','Second',$2)", second.UUID, fixture.actor.UUID); err != nil {
		t.Fatal(err)
	}
	input := struct {
		Value string `json:"value"`
	}{"same atomic intention"}
	apply := func(ctx context.Context, tx *command.Mutation, _ struct {
		Value string `json:"value"`
	}) (bool, error) {
		_, err := tx.Tx.Exec(ctx, "UPDATE projects SET revision=revision+1 WHERE id=$1 OR id=$2", fixture.project.UUID, second.UUID)
		return err == nil, err
	}
	validate := func(bool) error { return nil }
	authorize := func(context.Context, *command.Mutation) error { return nil }
	request := command.MutationRequest{
		Actor: command.Actor{
			UserID:  fixture.actor,
			Channel: command.REST,
		},
		Operation:      command.UpdateProject,
		RetryReference: uuid.NewString(),
		Access: command.Access{Projects: []command.ProjectScope{
			{ProjectID: fixture.project, Write: true},
			{ProjectID: second, Write: true},
		}},
	}
	holder, err := fixture.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := holder.Exec(ctx, "SELECT singleton FROM company_settings FOR UPDATE"); err != nil {
		t.Fatal(err)
	}
	bounded, cancel := context.WithTimeout(ctx, 75*time.Millisecond)
	_, err = command.Execute(bounded, command.Runner{Pool: fixture.pool}, request, input, authorize, apply, validate)
	cancel()
	if err == nil {
		t.Fatal("exclusive company guard was bypassed")
	}
	if err := holder.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM idempotency_records").Scan(&count); err != nil || count != 0 {
		t.Fatal("blocked request left a retry claim")
	}
	var group sync.WaitGroup
	for i := 0; i < 8; i++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			call := request
			call.RetryReference = uuid.NewString()
			call.Access.Projects = append([]command.ProjectScope(nil), request.Access.Projects...)
			if index%2 == 1 {
				call.Access.Projects[0], call.Access.Projects[1] = call.Access.Projects[1], call.Access.Projects[0]
			}
			if _, err := command.Execute(ctx, command.Runner{Pool: fixture.pool}, call, input, authorize, apply, validate); err != nil {
				t.Error(err)
			}
		}(i)
	}
	group.Wait()
	if err := fixture.pool.QueryRow(ctx, "SELECT count(*) FROM projects WHERE revision=9").Scan(&count); err != nil || count != 2 {
		t.Fatal("sorted project locks lost an atomic update")
	}
}
