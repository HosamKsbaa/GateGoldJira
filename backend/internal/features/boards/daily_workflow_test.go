package boards

import (
	"context"
	"encoding/json"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestProjectWorkflowAppliesWithoutBoardAndRetiresStages(t *testing.T) {
	f := boardDatabase(t)
	f.service.WithStageMover(f.issues.RetireStage)
	ctx := context.Background()
	b := f.create(t, "Delivery", command.IssueFilter{})
	other := f.create(t, "Team", command.IssueFilter{})
	w := deliveryFlow()
	limit := int32(2)
	w.Columns[1].WarningLimit = &limit
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          b.Board.ID,
		ExpectedRevision: b.Board.Revision,
		Name:             b.Board.Name,
		SavedFilters:     b.Board.SavedFilters,
		WipLimits:        b.Board.WipLimits,
		Workflow:         &w,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	issue := f.issue(t, "No shortcuts", command.Medium)
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, issue.Summary.ID, command.Done)); err == nil {
		t.Fatal("boardless shortcut bypassed project workflow")
	}
	view, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: other.Board.ID})
	if err != nil || boardWorkflow(view.Board).Columns[0].Name != "جاهز" {
		t.Fatal("workflow did not synchronize", err)
	}
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, issue.Summary.ID, command.InProgress)); err != nil {
		t.Fatal(err)
	}
	remaining := command.BoardWorkflow{Columns: []command.WorkflowColumn{}}
	for _, column := range w.Columns {
		if column.Status == command.InProgress {
			continue
		}
		column.AllowedTargets = []command.Status{}
		for _, target := range []command.Status{command.Todo, command.Review, command.Done} {
			if target != column.Status {
				column.AllowedTargets = append(column.AllowedTargets, target)
			}
		}
		remaining.Columns = append(remaining.Columns, column)
	}
	input := UpdateInput{
		BoardID:          b.Board.ID,
		ExpectedRevision: saved.Body.Result.Revision,
		Name:             b.Board.Name,
		SavedFilters:     b.Board.SavedFilters,
		WipLimits:        b.Board.WipLimits,
		Workflow:         &remaining,
		RetireStages: []command.StageRetirement{{
			Status:      command.InProgress,
			Replacement: command.Review,
		}},
		RetryReference: uuid.NewString(),
	}
	if _, err := f.service.Update(ctx, f.viewer, input); err == nil {
		t.Fatal("viewer retired stage")
	}
	retired, err := f.service.Update(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	current, err := f.issues.Get(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Status != command.Review || current.Summary.Revision <= issue.Summary.Revision {
		t.Fatal("retirement lost work", err)
	}
	if len(retired.Body.Result.Workflow.Columns) != 3 {
		t.Fatal("retired stage still displayed")
	}
	inputActor := f.member
	inputActor.Channel = command.MCP
	replay, err := f.service.Update(ctx, inputActor, input)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("retirement retry not idempotent", err)
	}
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          b.Board.ID,
		ExpectedRevision: retired.Body.Result.Revision,
		Name:             b.Board.Name,
		Workflow:         &w,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("retired identity was resurrected")
	}
}

// A project upgraded from board-specific rules must be able to adopt the visible
// workflow even when the user presses Save without editing that board's columns.
func TestExplicitUnchangedWorkflowReconcilesLegacyBoardRules(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	current := f.create(t, "Canonical", command.IssueFilter{})
	other := f.create(t, "Legacy", command.IssueFilter{})
	legacy, err := json.Marshal(deliveryFlow())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE boards SET workflow=$2 WHERE id=$1", other.Board.ID.UUID, legacy); err != nil {
		t.Fatal(err)
	}
	workflow := boardWorkflow(current.Board)
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          current.Board.ID,
		ExpectedRevision: current.Board.Revision,
		Name:             current.Board.Name,
		SavedFilters:     current.Board.SavedFilters,
		WipLimits:        current.Board.WipLimits,
		Workflow:         &workflow,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Body.Result.Revision <= current.Board.Revision {
		t.Fatal("reconciliation was treated as a no-op")
	}
	reconciled, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: other.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	want, _ := json.Marshal(workflow)
	got, _ := json.Marshal(boardWorkflow(reconciled.Board))
	if string(got) != string(want) {
		t.Fatal("explicit save did not synchronize legacy rules")
	}
}

func TestViewOnlyBoardChangeDoesNotInvalidateOtherBoards(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	current := f.create(t, "Delivery", command.IssueFilter{})
	other := f.create(t, "Unchanged", command.IssueFilter{})
	workflow := boardWorkflow(current.Board)
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          current.Board.ID,
		ExpectedRevision: current.Board.Revision,
		Name:             "Renamed view",
		Workflow:         &workflow,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	unchanged, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: other.Board.ID})
	if err != nil || unchanged.Board.Revision != other.Board.Revision {
		t.Fatal("unchanged board revision advanced", err)
	}
	repeated, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          current.Board.ID,
		ExpectedRevision: saved.Body.Result.Revision,
		Name:             saved.Body.Result.Name,
		Workflow:         &workflow,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || repeated.Body.Result.Revision != saved.Body.Result.Revision {
		t.Fatal("unchanged workflow save created a revision", err)
	}
}
