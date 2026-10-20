package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestBoardCardsBatchEpicsStayInsideAuthorizedReturnedPage(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Epic card pages", command.IssueFilter{Priorities: []command.Priority{command.High}})
	epicID := uuid.New()
	if _, err := f.pool.Exec(ctx, "INSERT INTO planning_items(id,project_id,kind,name,description,status,created_by) VALUES($1,$2,'epic','إطلاق الفريق','','active',$3)", epicID, f.project.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	for _, work := range []command.IssueView{
		f.issue(t, "First epic card", command.High),
		f.issue(t, "Second epic card", command.High),
		f.issue(t, "Next page epic card", command.High),
		f.issue(t, "Outside saved priority", command.Low),
	} {
		if _, err := f.pool.Exec(ctx, "INSERT INTO planning_issue(issue_id,project_id,epic_id) VALUES($1,$2,$3)", work.Summary.ID.UUID, f.project.UUID, epicID); err != nil {
			t.Fatal(err)
		}
	}
	limit := 2
	input := CardsInput{BoardID: board.Board.ID, Status: command.Todo, Page: command.PageRequest{Limit: &limit}}
	first, err := f.service.Cards(ctx, f.viewer, input)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || len(first.Epics) != 2 || first.NextCursor == nil || first.Column.SavedMatchCount != 3 || first.Column.VisibleMatchCount != 3 {
		t.Fatalf("unexpected bounded first page: %+v", first)
	}
	assertCardEpics := func(page CardPage) {
		t.Helper()
		ids := map[command.IssueID]bool{}
		for _, item := range page.Items {
			ids[item.ID] = true
		}
		for _, epic := range page.Epics {
			if !ids[epic.IssueID] || epic.EpicID.UUID != epicID || epic.EpicName != "إطلاق الفريق" {
				t.Fatalf("epic metadata outside the returned card page: %+v", epic)
			}
		}
	}
	assertCardEpics(first)
	input.Page.Cursor = first.NextCursor
	next, err := f.service.Cards(ctx, f.viewer, input)
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Items) != 1 || len(next.Epics) != 1 || next.NextCursor != nil {
		t.Fatalf("unexpected final page: %+v", next)
	}
	assertCardEpics(next)
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Cards(ctx, f.viewer, CardsInput{BoardID: board.Board.ID, Status: command.Todo}); err == nil {
		t.Fatal("revoked project access still received board card metadata")
	}
}
