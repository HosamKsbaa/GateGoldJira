package issues

import (
	"context"
	"errors"
	"sync"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func (f issueFixture) dependencyInput(t *testing.T, dependent, blocker command.IssueID) AddDependencyInput {
	t.Helper()
	current, err := f.service.Get(context.Background(), f.member, dependent)
	if err != nil {
		t.Fatal(err)
	}
	return AddDependencyInput{
		IssueID:               dependent,
		BlockerID:             blocker,
		ExpectedIssueRevision: current.Summary.Revision,
		ExpectedGraphRevision: current.GraphRevision,
		RetryReference:        uuid.NewString(),
	}
}
func (f issueFixture) moveInput(t *testing.T, id command.IssueID, status command.Status) MoveInput {
	t.Helper()
	v, err := f.service.Get(context.Background(), f.member, id)
	if err != nil {
		t.Fatal(err)
	}
	return MoveInput{
		IssueID:                     id,
		ExpectedRevision:            v.Summary.Revision,
		TargetStatus:                status,
		ExpectedSourceOrderRevision: v.SourceOrderRevision,
		ExpectedTargetOrderRevision: orderRevision(v, status),
		RetryReference:              uuid.NewString(),
	}
}
func TestDependencyDirectionsNoopRemovalReAddAndDone(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	a := f.create(t, "Dependent")
	b := f.create(t, "Another developer")
	in := f.dependencyInput(t, a.Summary.ID, b.Summary.ID)
	first, err := f.service.AddDependency(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	if first.Body.Result.Removed || !first.Body.Result.Dependent.Blocked || first.Body.Result.Blocker.ID != b.Summary.ID || first.Body.Result.GraphRevision != 2 || first.Body.Receipt.EventID == nil {
		t.Fatal("incorrect link outcome")
	}
	for _, pair := range []struct {
		id        command.IssueID
		direction DependencyDirection
	}{{a.Summary.ID, BlockedBy}, {b.Summary.ID, Blocks}} {
		page, err := f.service.Dependencies(ctx, f.viewer, ListDependenciesInput{IssueID: pair.id, Direction: pair.direction})
		if err != nil || len(page.Items) != 1 || page.Items[0].Dependent.ID != a.Summary.ID || page.Items[0].Blocker.ID != b.Summary.ID {
			t.Fatal("reciprocal direction missing", err)
		}
	}
	duplicate, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, b.Summary.ID))
	if err != nil || duplicate.Body.Receipt.EventID != nil || duplicate.Body.Result.GraphRevision != 2 || duplicate.Body.Result.Revision != 1 {
		t.Fatal("duplicate add is not a no-op", err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, a.Summary.ID, command.Done)); err == nil {
		t.Fatal("unfinished blocker allowed Done")
	}
	completed, err := f.service.Move(ctx, f.owner, f.moveInput(t, b.Summary.ID, command.Done))
	if err != nil {
		t.Fatal(err)
	}
	current, err := f.service.Get(ctx, f.member, a.Summary.ID)
	if err != nil || current.Summary.Status != command.Todo || current.Summary.Blocked {
		t.Fatal("blocker completion changed dependent status", err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, a.Summary.ID, command.Done)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Move(ctx, f.owner, f.moveInput(t, b.Summary.ID, command.Review)); err != nil {
		t.Fatal(err)
	}
	current, err = f.service.Get(ctx, f.member, a.Summary.ID)
	if err != nil || current.Summary.Status != command.Done || !current.Summary.Blocked {
		t.Fatal("reopened blocker lost warning/Done", err)
	}
	// Re-adding an existing unfinished blocker on Done remains an actual no-op.
	if _, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, b.Summary.ID)); err != nil {
		t.Fatal("existing link was checked as a new unfinished link", err)
	}
	remove := RemoveDependencyInput{
		IssueID:                    a.Summary.ID,
		BlockerID:                  b.Summary.ID,
		ExpectedIssueRevision:      current.Summary.Revision,
		ExpectedDependencyRevision: 1,
		ExpectedGraphRevision:      current.GraphRevision,
		RetryReference:             uuid.NewString(),
	}
	removed, err := f.service.RemoveDependency(ctx, f.member, remove)
	if err != nil || !removed.Body.Result.Removed || removed.Body.Result.Dependent.Blocked || removed.Body.Result.Revision != 2 {
		t.Fatal("removed link not retained/resolved", err)
	}
	current, err = f.service.Get(ctx, f.member, a.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	remove.ExpectedGraphRevision = current.GraphRevision
	remove.RetryReference = uuid.NewString()
	_, err = f.service.RemoveDependency(ctx, f.member, remove)
	var staleLink *DependencyConflict
	if !errors.As(err, &staleLink) || staleLink.Current.Revision != 2 || !staleLink.Current.Removed || failureBody(err).Current.Dependency == nil {
		t.Fatal("dependency conflict lost the current tombstone", err)
	}
	remove.ExpectedDependencyRevision = 2
	remove.RetryReference = uuid.NewString()
	noOp, err := f.service.RemoveDependency(ctx, f.member, remove)
	if err != nil || noOp.Body.Receipt.EventID != nil || noOp.Body.Result.Revision != 2 {
		t.Fatal("removed relationship was not a no-op", err)
	}
	if _, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, b.Summary.ID)); err == nil {
		t.Fatal("new unfinished blocker attached to Done")
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, a.Summary.ID, command.Review)); err != nil {
		t.Fatal(err)
	}
	readded, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, b.Summary.ID))
	if err != nil || readded.Body.Result.Revision != 3 {
		t.Fatal("tombstone revision reset", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.AddDependency(ctx, actor, in)
	if err != nil || !replay.Body.Receipt.Replayed || *replay.Body.Receipt.EventID != *first.Body.Receipt.EventID || replay.Body.Result.GraphRevision != first.Body.Result.GraphRevision {
		t.Fatal("replay did not retain original outcome", err)
	}
	if completed.Body.Result.Issue.Summary.Status != command.Done {
		t.Fatal("unexpected completion result")
	}
}
func TestDependencyCombinedCyclesScopeRolesAndStaleGraph(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	a := f.create(t, "A")
	b := f.create(t, "B")
	c := f.create(t, "C")
	stale := f.dependencyInput(t, a.Summary.ID, c.Summary.ID)
	if _, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, b.Summary.ID)); err != nil {
		t.Fatal(err)
	}
	_, err := f.service.AddDependency(ctx, f.member, stale)
	var conflict *IssueConflict
	if !errors.As(err, &conflict) || conflict.Current.GraphRevision != 2 {
		t.Fatal("graph conflict has no current issue", err)
	}
	for _, in := range []AddDependencyInput{
		f.dependencyInput(t, b.Summary.ID, a.Summary.ID),
		f.dependencyInput(t, a.Summary.ID, a.Summary.ID),
	} {
		if _, err := f.service.AddDependency(ctx, f.member, in); err == nil {
			t.Fatal("cycle/self accepted")
		}
	}
	if _, err := f.service.AddDependency(ctx, f.viewer, f.dependencyInput(t, a.Summary.ID, c.Summary.ID)); err == nil {
		t.Fatal("Viewer linked issues")
	}
	foreign := command.NewID[command.ProjectKind]()
	foreignIssue := command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'ZZ','Foreign',$2)", foreign.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,status FROM unnest(ARRAY['todo','in_progress','review','done']) status", foreign.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,1,'Foreign',$3,1024)", foreignIssue.UUID, foreign.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.AddDependency(ctx, f.owner, f.dependencyInput(t, a.Summary.ID, foreignIssue)); err == nil {
		t.Fatal("cross-project link accepted")
	}
	child := command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,type,parent_id,reporter_id,rank) VALUES($1,$2,100,'Child','subtask',$3,$4,9000)", child.UUID, f.project.UUID, a.Summary.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, child, a.Summary.ID)); err == nil {
		t.Fatal("cycle through parent-to-child edge accepted")
	}
}
func TestConcurrentDependencyGraphAndDoneCannotCommitInvalidState(t *testing.T) {
	for _, race := range []string{"cycle", "done"} {
		t.Run(race, func(t *testing.T) {
			f := issueDatabase(t)
			ctx := context.Background()
			a := f.create(t, "A")
			b := f.create(t, "B")
			left := f.dependencyInput(t, a.Summary.ID, b.Summary.ID)
			right := f.dependencyInput(t, b.Summary.ID, a.Summary.ID)
			move := f.moveInput(t, a.Summary.ID, command.Done)
			start := make(chan struct{})
			results := make(chan error, 2)
			var wg sync.WaitGroup
			for i := 0; i < 2; i++ {
				wg.Add(1)
				go func(index int) {
					defer wg.Done()
					<-start
					var err error
					if index == 0 {
						_, err = f.service.AddDependency(ctx, f.member, left)
					} else if race == "cycle" {
						_, err = f.service.AddDependency(ctx, f.member, right)
					} else {
						_, err = f.service.Move(ctx, f.owner, move)
					}
					results <- err
				}(i)
			}
			close(start)
			wg.Wait()
			close(results)
			success := 0
			for err := range results {
				if err == nil {
					success++
				}
			}
			if success != 1 {
				t.Fatal("expected exactly one compatible command", success)
			}
			var invalid bool
			if err := f.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM issues i JOIN issue_dependencies d ON d.dependent_id=i.id JOIN issues b ON b.id=d.blocker_id WHERE i.status='done' AND b.status<>'done' AND d.removed_at IS NULL)").Scan(&invalid); err != nil || invalid {
				t.Fatal("racing commands saved invalid Done", err)
			}
		})
	}
}
