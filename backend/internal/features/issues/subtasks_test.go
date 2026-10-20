package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"sync"
	"testing"
)

func TestSubtaskIndependentDefaultsReplayProgressAndGuards(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	parent := f.create(t, "Parent")
	in := CreateSubtaskInput{
		ParentID: parent.Summary.ID,
		CreateSubtaskFields: CreateSubtaskFields{
			ExpectedParentRevision: parent.Summary.Revision,
			Title:                  "عمل فرعي",
		},
		RetryReference: uuid.NewString(),
	}
	out, err := f.service.CreateSubtask(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	child := out.Body.Result
	if child.Summary.Parent.Value == nil || child.Summary.Parent.Value.ID != parent.Summary.ID || child.Summary.Type != command.Subtask || child.Summary.Status != command.Todo || child.Summary.Priority != command.Medium || child.Summary.Assignee.Value != nil || child.Reporter.ID != f.member.UserID || child.Summary.Key == parent.Summary.Key {
		t.Fatal("child defaults or attribution changed")
	}
	actor := f.member
	actor.Channel = command.MCP
	replayed, err := f.service.CreateSubtask(ctx, actor, in)
	if err != nil || !replayed.Body.Receipt.Replayed || replayed.Body.Result.Summary.ID != child.Summary.ID {
		t.Fatal("duplicate child on replay", err)
	}
	current, err := f.service.Get(ctx, f.viewer, parent.Summary.ID)
	if err != nil || current.Summary.SubtaskProgress.Total != 1 || current.Summary.SubtaskProgress.Done != 0 {
		t.Fatal("incorrect derived progress", err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, parent.Summary.ID, command.Done)); err == nil {
		t.Fatal("parent Done allowed with unfinished child")
	}
	nested := in
	nested.ParentID = child.Summary.ID
	nested.RetryReference = uuid.NewString()
	if _, err := f.service.CreateSubtask(ctx, f.member, nested); err == nil {
		t.Fatal("nested child allowed")
	}
	if _, err := f.service.CreateSubtask(ctx, f.viewer, in); err == nil {
		t.Fatal("Viewer created child")
	}
	edit := editable(child)
	edit.Title = "independent"
	due, _ := command.ParseDate("2026-12-31")
	edit.DueDate = &due
	edit.AssigneeID = &f.owner.UserID
	updated, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          child.Summary.ID,
		ExpectedRevision: child.Summary.Revision,
		Editable:         edit,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || updated.Body.Result.Summary.Parent.Value.ID != parent.Summary.ID {
		t.Fatal("independent child edit", err)
	}
	edit.Type = command.Task
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          child.Summary.ID,
		ExpectedRevision: updated.Body.Result.Summary.Revision,
		Editable:         edit,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("child type conversion accepted")
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, child.Summary.ID, command.Done)); err != nil {
		t.Fatal(err)
	}
	current, err = f.service.Get(ctx, f.member, parent.Summary.ID)
	if err != nil || current.Summary.Status == command.Done || current.Summary.SubtaskProgress.Done != 1 || current.Summary.DueDate != nil || current.Summary.Assignee.Value != nil {
		t.Fatal("automatic completion or inherited child fields", err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, parent.Summary.ID, command.Done)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, child.Summary.ID, command.Review)); err == nil {
		t.Fatal("child reopened beneath Done parent")
	}
	in.RetryReference = uuid.NewString()
	in.ExpectedParentRevision = current.Summary.Revision + 1
	if _, err := f.service.CreateSubtask(ctx, f.member, in); err == nil {
		t.Fatal("Done parent accepted child")
	}
}
func TestParentDoneAndChildCreateRaceCannotCommitInvalidState(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	parent := f.create(t, "Concurrent parent")
	move := f.moveInput(t, parent.Summary.ID, command.Done)
	child := CreateSubtaskInput{
		ParentID: parent.Summary.ID,
		CreateSubtaskFields: CreateSubtaskFields{
			ExpectedParentRevision: parent.Summary.Revision,
			Title:                  "Concurrent child",
		},
		RetryReference: uuid.NewString(),
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	start := make(chan struct{})
	wg.Add(2)
	go func() { defer wg.Done(); <-start; _, err := f.service.Move(ctx, f.member, move); errs <- err }()
	go func() { defer wg.Done(); <-start; _, err := f.service.CreateSubtask(ctx, f.member, child); errs <- err }()
	close(start)
	wg.Wait()
	close(errs)
	success := 0
	for err := range errs {
		if err == nil {
			success++
		} else {
			var failure *command.Failure
			if !errors.As(err, &failure) {
				t.Fatal(err)
			}
		}
	}
	if success != 1 {
		t.Fatal("both or neither race command succeeded", success)
	}
	var invalid bool
	if err := f.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM issues p JOIN issues c ON c.parent_id=p.id WHERE p.status='done' AND c.status<>'done')").Scan(&invalid); err != nil || invalid {
		t.Fatal("invalid committed parent/child state", err)
	}
}

func TestParentDoneAndChildReopenRaceAndMixedCycle(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	parent := f.create(t, "Parent")
	made, err := f.service.CreateSubtask(ctx, f.member, CreateSubtaskInput{
		ParentID: parent.Summary.ID,
		CreateSubtaskFields: CreateSubtaskFields{
			ExpectedParentRevision: parent.Summary.Revision,
			Title:                  "Child",
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	child := made.Body.Result
	// The implicit parent-to-child prerequisite participates in explicit cycles.
	if _, err := f.service.AddDependency(ctx, f.member, AddDependencyInput{
		IssueID:               child.Summary.ID,
		BlockerID:             parent.Summary.ID,
		ExpectedIssueRevision: child.Summary.Revision,
		ExpectedGraphRevision: child.GraphRevision,
		RetryReference:        uuid.NewString(),
	}); err == nil {
		t.Fatal("mixed parent/explicit cycle accepted")
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, child.Summary.ID, command.Done)); err != nil {
		t.Fatal(err)
	}
	complete := f.moveInput(t, parent.Summary.ID, command.Done)
	reopen := f.moveInput(t, child.Summary.ID, command.Review)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); <-start; _, err := f.service.Move(ctx, f.member, complete); errs <- err }()
	go func() { defer wg.Done(); <-start; _, err := f.service.Move(ctx, f.member, reopen); errs <- err }()
	close(start)
	wg.Wait()
	close(errs)
	success := 0
	for err := range errs {
		if err == nil {
			success++
		} else {
			var failure *command.Failure
			if !errors.As(err, &failure) {
				t.Fatal(err)
			}
		}
	}
	if success != 1 {
		t.Fatal("parent complete/child reopen race", success)
	}
	var invalid bool
	if err := f.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM issues p JOIN issues c ON c.parent_id=p.id WHERE p.status='done' AND c.status<>'done')").Scan(&invalid); err != nil || invalid {
		t.Fatal("invalid completed parent persisted", err)
	}
}
