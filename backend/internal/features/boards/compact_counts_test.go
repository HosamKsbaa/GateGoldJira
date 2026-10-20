package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"testing"
)

func TestCompactUnfilteredCountsMatchFilteredGroupedAndChangedWork(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Count fixture", command.IssueFilter{})
	for i := range 12 {
		issue := f.issue(t, "Count work", command.Medium)
		if _, err := f.pool.Exec(ctx, "UPDATE issue_records SET stage_id=(SELECT id FROM workflow_stages WHERE project_id=$2 AND legacy_status=$3),archived=$4,backlog=$5 WHERE id=$1", issue.Summary.ID.UUID, f.project.UUID, []string{"todo", "in_progress", "review", "done"}[i%4], i == 9, i == 8); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_column_stages SET column_id=(SELECT id FROM board_columns WHERE board_id=$1 AND legacy_status='in_progress') WHERE board_id=$1 AND stage_id=(SELECT id FROM workflow_stages WHERE project_id=$2 AND legacy_status='review')", board.Board.ID.UUID, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	native, err := f.service.GetLayout(ctx, f.owner, GetInput{BoardID: board.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	filtered, err := f.service.GetLayout(ctx, f.owner, GetInput{
		BoardID: board.Board.ID,
		TemporaryFilters: command.IssueFilter{Statuses: []command.Status{
			command.Todo,
			command.InProgress,
			command.Review,
			command.Done,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, col := range native.Columns {
		if col.SavedMatchCount != filtered.Columns[i].SavedMatchCount || col.VisibleMatchCount != filtered.Columns[i].VisibleMatchCount {
			t.Fatal("exact grouped counts differ", col, filtered.Columns[i])
		}
	}
}
