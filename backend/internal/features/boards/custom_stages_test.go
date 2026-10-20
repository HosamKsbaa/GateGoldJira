package boards

import (
	"context"
	"fmt"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestCustomStagesHaveNoFixedCountAndShareProjectOrder(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Custom delivery", command.IssueFilter{})
	other := f.create(t, "Other view", command.IssueFilter{})
	flow := defaultWorkflow()
	// More than common small workflow limits: adding stages remains data-driven.
	for i := 0; i < 40; i++ {
		status := command.Status("in_progress:" + uuid.NewString())
		flow.Columns = append(flow.Columns, command.WorkflowColumn{
			Status:         status,
			Name:           fmt.Sprintf("QA %02d", i),
			AllowedTargets: []command.Status{command.Done},
		})
		flow.Columns[0].AllowedTargets = append(flow.Columns[0].AllowedTargets, status)
	}
	shipped := command.Status("done:" + uuid.NewString())
	flow.Columns = append(flow.Columns, command.WorkflowColumn{
		Status:         shipped,
		Name:           "Released",
		AllowedTargets: []command.Status{command.Todo},
	})
	flow.Columns[0].AllowedTargets = append(flow.Columns[0].AllowedTargets, shipped)
	flow.Columns[4].AllowedTargets = append(flow.Columns[4].AllowedTargets, shipped)
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             board.Board.Name,
		SavedFilters:     board.Board.SavedFilters,
		WipLimits:        board.Board.WipLimits,
		Workflow:         &flow,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	otherView, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: other.Board.ID})
	if err != nil || len(otherView.Columns) != 45 || otherView.Board.Revision <= other.Board.Revision {
		t.Fatal("new project stages not propagated with revision", err)
	}
	work := f.issue(t, "Custom stage work", command.Medium)
	qa := flow.Columns[4].Status
	in := f.movement(t, work.Summary.ID, qa)
	in.SourceBoardID = &board.Board.ID
	in.ExpectedBoardRevision = &saved.Body.Result.Revision
	moved, err := f.issues.Move(ctx, f.member, in)
	if err != nil || moved.Body.Result.Issue.Summary.Status != qa || moved.Body.Result.Issue.Summary.StatusName != "QA 00" {
		t.Fatal("custom stage lost", err)
	}
	cards, err := f.service.Cards(ctx, f.viewer, CardsInput{BoardID: other.Board.ID, Status: qa})
	if err != nil || len(cards.Items) != 1 || cards.Items[0].ID != work.Summary.ID {
		t.Fatal("custom cards hidden on another board", err)
	}
	// Boardless movement uses the expanded default workflow, including completed categories.
	done, err := f.issues.Move(ctx, f.member, f.movement(t, work.Summary.ID, shipped))
	if err != nil || done.Body.Result.Issue.Summary.Status.Category() != command.Done {
		t.Fatal("custom completed category failed", err)
	}
	query := command.IssueFilter{Statuses: []command.Status{command.Done}}
	page, err := f.issues.Search(ctx, f.member, issues.SearchInput{Filters: query})
	if err != nil || len(page.Items) != 1 {
		t.Fatal("Done category filter missed custom completed work", err)
	}
}

func TestCustomCompletedStagesRetainBlockerAndHierarchyGuards(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Completion guards", command.IssueFilter{})
	flow := defaultWorkflow()
	qa := command.Status("review:" + uuid.NewString())
	released := command.Status("done:" + uuid.NewString())
	for index := range flow.Columns {
		flow.Columns[index].AllowedTargets = append(flow.Columns[index].AllowedTargets, qa, released)
	}
	flow.Columns = append(flow.Columns, command.WorkflowColumn{
		Status:         qa,
		Name:           "QA",
		AllowedTargets: []command.Status{command.Done, released},
	}, command.WorkflowColumn{
		Status:         released,
		Name:           "Released",
		AllowedTargets: []command.Status{command.Todo, qa, command.Done},
	})
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             board.Board.Name,
		SavedFilters:     board.Board.SavedFilters,
		WipLimits:        board.Board.WipLimits,
		Workflow:         &flow,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	parent := f.issue(t, "Parent", command.Medium)
	child, err := f.issues.CreateSubtask(ctx, f.member, issues.CreateSubtaskInput{
		ParentID: parent.Summary.ID,
		CreateSubtaskFields: issues.CreateSubtaskFields{
			ExpectedParentRevision: parent.Summary.Revision,
			Title:                  "Child",
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	blocker := f.issue(t, "Blocker", command.Medium)
	current, _ := f.issues.Get(ctx, f.member, parent.Summary.ID)
	if _, err := f.issues.AddDependency(ctx, f.member, issues.AddDependencyInput{
		IssueID:               parent.Summary.ID,
		BlockerID:             blocker.Summary.ID,
		ExpectedIssueRevision: current.Summary.Revision,
		ExpectedGraphRevision: current.GraphRevision,
		RetryReference:        uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, parent.Summary.ID, released)); err == nil {
		t.Fatal("custom completed stage bypassed unfinished work")
	}
	for _, id := range []command.IssueID{child.Body.Result.Summary.ID, blocker.Summary.ID} {
		if _, err := f.issues.Move(ctx, f.member, f.movement(t, id, qa)); err != nil {
			t.Fatal(err)
		}
		if _, err := f.issues.Move(ctx, f.member, f.movement(t, id, released)); err != nil {
			t.Fatal(err)
		}
	}
	done, err := f.issues.Move(ctx, f.member, f.movement(t, parent.Summary.ID, released))
	if err != nil || done.Body.Result.Issue.Summary.SubtaskProgress.Done != 1 || done.Body.Result.Issue.Summary.Blocked {
		t.Fatal("custom done counts or guard failed", err)
	}
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, child.Body.Result.Summary.ID, qa)); err == nil {
		t.Fatal("reopened child beneath custom completed parent")
	}
	if _, err := f.issues.CreateSubtask(ctx, f.member, issues.CreateSubtaskInput{
		ParentID: parent.Summary.ID,
		CreateSubtaskFields: issues.CreateSubtaskFields{
			ExpectedParentRevision: done.Body.Result.Issue.Summary.Revision,
			Title:                  "Another child",
		},
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("added child beneath custom completed parent")
	}
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, child.Body.Result.Summary.ID, command.Done)); err != nil {
		t.Fatal("moving between completed stages was treated as reopen", err)
	}
}
