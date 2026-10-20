package boards

import (
	"context"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestNativeReorderIsBoardOwnedAndRetrySafe(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	f.service.WithModernSummaries(issues.ModernSummaries)
	f.service.WithNativeMover(f.issues.MoveStageForBoard)
	a := f.issue(t, "A", command.Medium)
	b := f.issue(t, "B", command.Medium)
	board := f.create(t, "First layout", command.IssueFilter{})
	other := f.create(t, "Second layout", command.IssueFilter{})
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	layout, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: board.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	c := layout.Columns[0]
	input := NativeMoveInput{
		BoardID: board.Board.ID,
		NativeMoveFields: NativeMoveFields{
			IssueID:                     b.Summary.ID,
			ExpectedIssueRevision:       b.Summary.Revision,
			ExpectedBoardRevision:       layout.Board.Revision,
			TargetColumnID:              c.ID,
			ExpectedTargetOrderRevision: c.OrderRevision,
			SourceColumnID:              &c.ID,
			ExpectedSourceOrderRevision: &c.OrderRevision,
			NeighborIssueID:             &a.Summary.ID,
			Placement:                   PlaceBefore,
		},
		RetryReference: uuid.NewString(),
	}
	out, err := f.service.MoveCard(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	if out.Body.Result.Issue.Summary.Revision != b.Summary.Revision || out.Body.Result.Layout.Columns[0].OrderRevision != c.OrderRevision+1 {
		t.Fatal("reorder edited content or wrong revision")
	}
	page, err := f.service.NativeCards(ctx, f.member, NativeCardsInput{BoardID: board.Board.ID, ColumnID: c.ID})
	if err != nil || page.Items[0].ID != b.Summary.ID {
		t.Fatal("first board", err)
	}
	second, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: other.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	page, err = f.service.NativeCards(ctx, f.member, NativeCardsInput{
		BoardID:  other.Board.ID,
		ColumnID: second.Columns[0].ID,
	})
	if err != nil || page.Items[0].ID != a.Summary.ID {
		t.Fatal("other board rank changed", err)
	}
	replay, err := f.service.MoveCard(ctx, f.member, input)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("retry", err)
	}
	input.RetryReference = uuid.NewString()
	if _, err = f.service.MoveCard(ctx, f.member, input); err == nil {
		t.Fatal("stale order accepted")
	}
	if _, err = f.service.MoveCard(ctx, f.viewer, input); err == nil {
		t.Fatal("viewer moved")
	}
}

func TestNativeGroupedDropRequiresAnExplicitEligibleStage(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	f.service.WithModernSummaries(issues.ModernSummaries)
	f.service.WithNativeMover(f.issues.MoveStageForBoard)
	issue := f.issue(t, "Ambiguous drop", command.Medium)
	board := f.create(t, "Grouped", command.IssueFilter{})
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	initial, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: board.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	draft := layoutDraft(initial)
	doing := draft.Columns[1]
	review := draft.Columns[2].StageIDs[0]
	draft.Columns[1].StageIDs = append(draft.Columns[1].StageIDs, review)
	draft.Columns = append(draft.Columns[:2], draft.Columns[3:]...)
	changed, err := f.service.SaveLayout(ctx, f.member, SaveLayoutInput{
		BoardID:          board.Board.ID,
		SaveLayoutFields: draft,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	view := changed.Body.Result
	source := view.Columns[0]
	target := view.Columns[1]
	input := NativeMoveInput{
		BoardID: board.Board.ID,
		NativeMoveFields: NativeMoveFields{
			IssueID:                     issue.Summary.ID,
			ExpectedIssueRevision:       issue.Summary.Revision,
			ExpectedBoardRevision:       view.Board.Revision,
			SourceColumnID:              &source.ID,
			ExpectedSourceOrderRevision: &source.OrderRevision,
			TargetColumnID:              target.ID,
			ExpectedTargetOrderRevision: target.OrderRevision,
			Placement:                   PlaceLast,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err = f.service.MoveCard(ctx, f.member, input); err == nil {
		t.Fatal("ambiguous stage silently chosen")
	}
	input.TargetStageID = &doing.StageIDs[0]
	input.RetryReference = uuid.NewString()
	saved, err := f.service.MoveCard(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Body.Result.Issue.Summary.Stage.ID != doing.StageIDs[0] || saved.Body.Result.Issue.Summary.Revision != issue.Summary.Revision+1 {
		t.Fatal("wrong native transition")
	}
	if saved.Body.Result.Layout.Columns[0].OrderRevision != source.OrderRevision+1 || saved.Body.Result.Layout.Columns[1].OrderRevision != target.OrderRevision+1 {
		t.Fatal("stage movement double-advanced board order")
	}
	// Exact same-column placement is a no-op with no issue or order revision.
	view = saved.Body.Result.Layout
	target = view.Columns[1]
	input.ExpectedIssueRevision = saved.Body.Result.Issue.Summary.Revision
	input.ExpectedBoardRevision = view.Board.Revision
	input.SourceColumnID = &target.ID
	input.ExpectedSourceOrderRevision = &target.OrderRevision
	input.ExpectedTargetOrderRevision = target.OrderRevision
	input.TargetStageID = nil
	input.RetryReference = uuid.NewString()
	again, err := f.service.ReorderCard(ctx, f.member, input)
	if err != nil || again.Body.Receipt.EventID != nil || again.Body.Result.Layout.Columns[1].OrderRevision != target.OrderRevision {
		t.Fatal("last placement was not a no-op", err)
	}
}

func TestNativeReorderCanProgressWhileAnotherBoardColumnIsLocked(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	f.service.WithModernSummaries(issues.ModernSummaries)
	f.service.WithNativeMover(f.issues.MoveStageForBoard)
	a := f.issue(t, "A", command.Medium)
	b := f.issue(t, "B", command.Medium)
	first := f.create(t, "Locked view", command.IssueFilter{})
	second := f.create(t, "Independent view", command.IssueFilter{})
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	firstView, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: first.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	secondView, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: second.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	held, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Rollback(ctx)
	if _, err = held.Exec(ctx, "SELECT pg_advisory_xact_lock_shared(hashtextextended('gategoldjira:project-lifecycle:'||$1::text,0))", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = held.Exec(ctx, "SELECT id FROM board_columns WHERE id=$1 FOR UPDATE", firstView.Columns[0].ID.UUID); err != nil {
		t.Fatal(err)
	}
	source := secondView.Columns[0]
	out, err := f.service.ReorderCard(ctx, f.member, NativeMoveInput{
		BoardID: second.Board.ID,
		NativeMoveFields: NativeMoveFields{
			IssueID:                     b.Summary.ID,
			ExpectedIssueRevision:       b.Summary.Revision,
			ExpectedBoardRevision:       secondView.Board.Revision,
			SourceColumnID:              &source.ID,
			ExpectedSourceOrderRevision: &source.OrderRevision,
			TargetColumnID:              source.ID,
			ExpectedTargetOrderRevision: source.OrderRevision,
			NeighborIssueID:             &a.Summary.ID,
			Placement:                   PlaceBefore,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || out.Body.Result.Issue.Summary.Revision != b.Summary.Revision {
		t.Fatal("different column remained serialized by the project", err)
	}
}
