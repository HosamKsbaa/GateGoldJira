package integration

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestAtomicRetriesAcrossChannelsAndCurrentRevocation(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	actor := command.NewID[command.UserKind]()
	project := command.NewID[command.ProjectKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at) VALUES($1,'member@example.test','member@example.test','عضو',now())", actor.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Project',$2)", project.UUID, actor.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", project.UUID, actor.UUID); err != nil {
		t.Fatal(err)
	}
	request := command.MutationRequest{
		Actor:          command.Actor{UserID: actor, Channel: command.REST},
		Operation:      command.UpdateProject,
		RetryReference: uuid.NewString(),
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: project, Write: true}}},
	}
	type input struct {
		Name string `json:"name"`
	}
	type output struct {
		Revision command.Revision `json:"revision"`
	}
	var applied atomic.Int32
	apply := func(ctx context.Context, mutation *command.Mutation, value input) (output, error) {
		applied.Add(1)
		var revision int64
		err := mutation.Tx.QueryRow(ctx, "UPDATE projects SET name=$2,revision=revision+1 WHERE id=$1 RETURNING revision", project.UUID, value.Name).Scan(&revision)
		return output{command.Revision(revision)}, err
	}
	authorize := func(context.Context, *command.Mutation) error { return nil }
	validate := func(value output) error {
		if value.Revision < 1 {
			return errors.New("invalid revision")
		}
		return nil
	}
	var wait sync.WaitGroup
	for i := 0; i < 8; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			call := request
			if index%2 == 1 {
				call.Actor.Channel = command.MCP
			}
			result, err := command.Execute(ctx, command.Runner{Pool: pool}, call, input{"مراجعة"}, authorize, apply, validate)
			if err != nil || result.Revision != 2 {
				t.Errorf("retry outcome %v %v", result, err)
			}
		}(i)
	}
	wait.Wait()
	if applied.Load() != 1 {
		t.Fatalf("command applied %d times", applied.Load())
	}
	if _, err := command.Execute(ctx, command.Runner{Pool: pool}, request, input{"Different intention"}, authorize, apply, validate); err == nil {
		t.Fatal("reused reference accepted different input")
	}
	if _, err := pool.Exec(ctx, "UPDATE project_memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2", project.UUID, actor.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := command.Execute(ctx, command.Runner{Pool: pool}, request, input{"مراجعة"}, authorize, apply, validate); err == nil {
		t.Fatal("replay bypassed current membership")
	}
	if _, err := pool.Exec(ctx, "UPDATE project_memberships SET role='member' WHERE project_id=$1 AND user_id=$2", project.UUID, actor.UUID); err != nil {
		t.Fatal(err)
	}
	failed := request
	failed.RetryReference = uuid.NewString()
	rollbackApply := func(ctx context.Context, mutation *command.Mutation, value input) (output, error) {
		result, err := apply(ctx, mutation, value)
		if err != nil {
			return result, err
		}
		return result, &command.Failure{
			Code:       command.Validation,
			Message:    "intentional failure",
			NextAction: command.ReviewFields,
		}
	}
	if _, err := command.Execute(ctx, command.Runner{Pool: pool}, failed, input{"Should roll back"}, authorize, rollbackApply, validate); err == nil {
		t.Fatal("failed command succeeded")
	}
	var revision int64
	if err := pool.QueryRow(ctx, "SELECT revision FROM projects WHERE id=$1", project.UUID).Scan(&revision); err != nil || revision != 2 {
		t.Fatal("failed command left partial business state")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM idempotency_records").Scan(&count); err != nil || count != 1 {
		t.Fatal("failed command left a replay claim")
	}
}
