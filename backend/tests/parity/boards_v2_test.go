package parity

import (
	"context"
	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func matrixNativeBoards(t *testing.T, m *catalogMatrix) {
	t.Helper()
	actor := m.runtime.Admin
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, actor, command.CreateProject, projects.CreateInput{
		Key:            "BOARDSV2",
		Name:           "Native board transport",
		RetryReference: uuid.NewString(),
	})
	if _, err := m.runtime.Pool.Exec(context.Background(), "UPDATE projects SET core_mode='modern' WHERE id=$1", project.ID.UUID); err != nil {
		t.Fatal(err)
	}
	board := matrixSave[boards.CreateInput, boards.LayoutView, boards.BoardFailureBody](t, m, actor, command.CreateModernBoard, boards.CreateInput{
		ProjectID:      project.ID,
		Name:           "Independent stages",
		SavedFilters:   command.IssueFilter{},
		RetryReference: uuid.NewString(),
	})
	columns := []boards.ColumnDraft{}
	for _, c := range board.Columns {
		ids := []command.StageID{}
		for _, mapped := range c.Stages {
			ids = append(ids, mapped.Stage.ID)
		}
		columns = append(columns, boards.ColumnDraft{ID: c.ID, Name: c.Name, StageIDs: ids, WipMode: boards.WipWarn})
	}
	columns[2].Name = "Quality review"
	board = matrixSave[boards.SaveLayoutInput, boards.LayoutView, boards.BoardFailureBody](t, m, actor, command.SaveBoardLayout, boards.SaveLayoutInput{
		BoardID: board.Board.ID,
		SaveLayoutFields: boards.SaveLayoutFields{
			ExpectedRevision: board.Board.Revision,
			Name:             board.Board.Name,
			SavedFilters:     command.IssueFilter{},
			Columns:          columns,
		},
		RetryReference: uuid.NewString(),
	})
	first := matrixSave[issues.ModernCreateInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, actor, command.CreateModernIssue, issues.ModernCreateInput{
		ProjectID:          project.ID,
		ModernCreateFields: issues.ModernCreateFields{Title: "Native A"},
		RetryReference:     uuid.NewString(),
	})
	second := matrixSave[issues.ModernCreateInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, actor, command.CreateModernIssue, issues.ModernCreateInput{
		ProjectID:          project.ID,
		ModernCreateFields: issues.ModernCreateFields{Title: "Native B"},
		RetryReference:     uuid.NewString(),
	})
	board = matrixRead[boards.GetInput, boards.LayoutView, boards.BoardFailureBody](t, m, actor, command.GetBoardLayout, boards.GetInput{BoardID: board.Board.ID})
	source := board.Columns[0]
	target := board.Columns[2]
	ordered := matrixSave[boards.NativeMoveInput, boards.NativeMoveResult, boards.BoardFailureBody](t, m, actor, command.ReorderBoardCard, boards.NativeMoveInput{
		BoardID: board.Board.ID,
		NativeMoveFields: boards.NativeMoveFields{
			IssueID:                     second.Summary.ID,
			ExpectedIssueRevision:       second.Summary.Revision,
			ExpectedBoardRevision:       board.Board.Revision,
			SourceColumnID:              &source.ID,
			ExpectedSourceOrderRevision: &source.OrderRevision,
			TargetColumnID:              source.ID,
			ExpectedTargetOrderRevision: source.OrderRevision,
			NeighborIssueID:             &first.Summary.ID,
			Placement:                   boards.PlaceBefore,
		},
		RetryReference: uuid.NewString(),
	})
	source = ordered.Layout.Columns[0]
	target = ordered.Layout.Columns[2]
	moved := matrixSave[boards.NativeMoveInput, boards.NativeMoveResult, boards.BoardFailureBody](t, m, actor, command.MoveBoardCard, boards.NativeMoveInput{
		BoardID: board.Board.ID,
		NativeMoveFields: boards.NativeMoveFields{
			IssueID:                     second.Summary.ID,
			ExpectedIssueRevision:       second.Summary.Revision,
			ExpectedBoardRevision:       board.Board.Revision,
			SourceColumnID:              &source.ID,
			ExpectedSourceOrderRevision: &source.OrderRevision,
			TargetColumnID:              target.ID,
			ExpectedTargetOrderRevision: target.OrderRevision,
			Placement:                   boards.PlaceLast,
		},
		RetryReference: uuid.NewString(),
	})
	page := matrixRead[boards.NativeCardsInput, boards.NativeCardPage, boards.BoardFailureBody](t, m, actor, command.ListNativeBoardCards, boards.NativeCardsInput{
		BoardID:  board.Board.ID,
		ColumnID: target.ID,
	})
	if len(page.Items) != 1 || page.Items[0].ID != second.Summary.ID || page.Items[0].Stage.ID != moved.Issue.Summary.Stage.ID || !page.Terminal {
		t.Fatal("native card transport")
	}
}
