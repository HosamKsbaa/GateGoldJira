package boards

import (
	"context"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"testing"
)

func TestNativeCardsTraverseRankedAndUnrankedWithoutDuplicates(t *testing.T) {
	f := boardDatabase(t)
	f.service.WithModernSummaries(issues.ModernSummaries)
	ctx := context.Background()
	b := f.create(t, "Native board", command.IssueFilter{})
	first := f.issue(t, "Ranked", command.High)
	second := f.issue(t, "Unranked A", command.Medium)
	third := f.issue(t, "Unranked B", command.Medium)
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "DELETE FROM board_issue_ranks WHERE board_id=$1 AND issue_id<>$2", b.Board.ID.UUID, first.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	view, err := f.service.GetLayout(ctx, f.viewer, GetInput{BoardID: b.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	column := view.Columns[0]
	if column.SavedMatchCount != 3 || len(column.Stages) != 1 {
		t.Fatal("incorrect layout", column)
	}
	one := 1
	input := NativeCardsInput{BoardID: b.Board.ID, ColumnID: column.ID, Page: command.PageRequest{Limit: &one}}
	ids := []command.IssueID{}
	for n := 0; n < 4; n++ {
		page, err := f.service.NativeCards(ctx, f.viewer, input)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range page.Items {
			ids = append(ids, item.ID)
		}
		if page.NextCursor == nil {
			if !page.Terminal {
				t.Fatal("terminal not explicit")
			}
			break
		}
		input.Page.Cursor = page.NextCursor
	}
	if len(ids) != 3 || ids[0] != first.Summary.ID || ids[1] != second.Summary.ID || ids[2] != third.Summary.ID {
		t.Fatal("phase order", ids)
	}
	query := "2"
	filtered, err := f.service.NativeCards(ctx, f.viewer, NativeCardsInput{
		BoardID:          b.Board.ID,
		ColumnID:         column.ID,
		TemporaryFilters: command.IssueFilter{Query: &query},
	})
	if err != nil || len(filtered.Items) != 1 || filtered.Items[0].ID != second.Summary.ID || filtered.Column.SavedMatchCount != 3 || filtered.Column.VisibleMatchCount != 1 {
		t.Fatal("numeric filter/count parity", filtered, err)
	}
	// Content and configuration changes invalidate scoped cursors; another caller
	// cannot reuse this viewer's cursor even when the same rows are visible.
	input.Page.Cursor = nil
	page, err := f.service.NativeCards(ctx, f.viewer, input)
	if err != nil || page.NextCursor == nil {
		t.Fatal(err)
	}
	input.Page.Cursor = page.NextCursor
	if _, err = f.service.NativeCards(ctx, f.member, input); err == nil {
		t.Fatal("cross-caller cursor accepted")
	}
	if _, err = f.pool.Exec(ctx, "UPDATE board_columns SET order_revision=order_revision+1 WHERE id=$1", column.ID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.service.NativeCards(ctx, f.viewer, input); err == nil {
		t.Fatal("stale order cursor accepted")
	}
}
