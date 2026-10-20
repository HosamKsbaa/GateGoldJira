package boards

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"sync"
	"testing"
)

func TestHardWIPConcurrentPriorityEntriesHaveOneWinner(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	a := f.issue(t, "A", command.Medium)
	b := f.issue(t, "B", command.Medium)
	board := f.create(t, "High-priority capacity", command.IssueFilter{})
	var high, medium uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM priorities WHERE project_id=$1 AND key='high'", f.project.UUID).Scan(&high); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT id FROM priorities WHERE project_id=$1 AND key='medium'", f.project.UUID).Scan(&medium); err != nil {
		t.Fatal(err)
	}
	filter, _ := json.Marshal(command.IssueFilter{PriorityIDs: []command.PriorityID{{UUID: high}}})
	if _, err := f.pool.Exec(ctx, "UPDATE boards SET saved_filters=$2::jsonb WHERE id=$1", board.Board.ID.UUID, filter); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_columns SET wip_mode='block',wip_limit=1 WHERE board_id=$1 AND legacy_status='todo'", board.Board.ID.UUID); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var group sync.WaitGroup
	for _, id := range []command.IssueID{a.Summary.ID, b.Summary.ID} {
		group.Add(1)
		go func(id command.IssueID) {
			defer group.Done()
			<-start
			_, err := f.issues.PatchModernField(ctx, f.member, issues.ModernPatchInput{
				IssueID: id,
				ModernPatchFields: issues.ModernPatchFields{
					Field: issues.PriorityIDField,
					Priority: &issues.PriorityIDChange{
						Prior: command.PriorityID{UUID: medium},
						Value: command.PriorityID{UUID: high},
					},
				},
				RetryReference: uuid.NewString(),
			})
			results <- err
		}(id)
	}
	close(start)
	group.Wait()
	close(results)
	winners, denials := 0, 0
	for err := range results {
		if err == nil {
			winners++
			continue
		}
		var failure *command.Failure
		if !errors.As(err, &failure) || failure.Code != command.Validation {
			t.Fatal("unexpected failure", err)
		}
		denials++
	}
	if winners != 1 || denials != 1 {
		t.Fatal("capacity race", winners, denials)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1 AND priority_id=$2", f.project.UUID, high).Scan(&count); err != nil || count != 1 {
		t.Fatal("cap exceeded", count, err)
	}
	// A blocked transaction leaves neither a content revision nor an event.
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1 AND revision=1", f.project.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("denied edit committed", count, err)
	}
}
func TestHardWIPRejectsCreateButAllowsReducingOccupancyAndNoops(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	issue := f.issue(t, "At capacity", command.Medium)
	board := f.create(t, "Capacity", command.IssueFilter{})
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_columns SET wip_mode='block',wip_limit=1 WHERE board_id=$1 AND legacy_status='todo'", board.Board.ID.UUID); err != nil {
		t.Fatal(err)
	}
	_, err := f.issues.CreateModern(ctx, f.member, issues.ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: issues.ModernCreateFields{Title: "Blocked creation"},
		RetryReference:     uuid.NewString(),
	})
	var fail *command.Failure
	if !errors.As(err, &fail) || fail.Code != command.Validation {
		t.Fatal("create bypassed capacity", err)
	}
	archived := true
	out, err := f.issues.Organize(ctx, f.member, issues.OrganizeInput{
		IssueID: issue.Summary.ID,
		OrganizeFields: issues.OrganizeFields{
			ExpectedRevision: issue.Summary.Revision,
			Archived:         &archived,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("reduction denied", err)
	}
	fresh, err := f.issues.CreateModern(ctx, f.member, issues.ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: issues.ModernCreateFields{Title: "Vacant slot"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	archived = false
	_, err = f.issues.Organize(ctx, f.member, issues.OrganizeInput{
		IssueID: issue.Summary.ID,
		OrganizeFields: issues.OrganizeFields{
			ExpectedRevision: out.Body.Result.Summary.Revision,
			Archived:         &archived,
		},
		RetryReference: uuid.NewString(),
	})
	if !errors.As(err, &fail) || fail.Code != command.Validation {
		t.Fatal("restore bypassed capacity", err)
	}
	noOp, err := f.issues.PatchModernField(ctx, f.member, issues.ModernPatchInput{
		IssueID: fresh.Body.Result.Summary.ID,
		ModernPatchFields: issues.ModernPatchFields{
			Field: issues.PriorityIDField,
			Priority: &issues.PriorityIDChange{
				Prior: fresh.Body.Result.Summary.Priority.ID,
				Value: fresh.Body.Result.Summary.Priority.ID,
			},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || noOp.Body.Receipt.EventID != nil {
		t.Fatal("no-op denied", err)
	}
}
func TestHardFiltersRejectRelativeAndDependentMembership(t *testing.T) {
	yes := true
	for _, filter := range []command.IssueFilter{
		{Overdue: &yes},
		{Blocked: &yes},
		{Assignee: &command.AssigneeFilter{Mode: command.AssigneeMe}},
	} {
		if validateHardFilter(filter) == nil {
			t.Fatal("unstable hard filter accepted")
		}
	}
	date, _ := command.ParseDate("2026-10-01")
	if err := validateHardFilter(command.IssueFilter{DueFrom: &date}); err != nil {
		t.Fatal("absolute date denied", err)
	}
}
