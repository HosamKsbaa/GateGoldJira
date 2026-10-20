package boards

import (
	"context"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestNativeLayoutRevisionCoverageNoopAndCreation(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	f.service.WithModernSummaries(issues.ModernSummaries)
	issue := f.issue(t, "Existing work", command.Medium)
	legacy := f.create(t, "Independent", command.IssueFilter{})
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	view, err := f.service.GetLayout(ctx, f.member, GetInput{BoardID: legacy.Board.ID})
	if err != nil {
		t.Fatal(err)
	}
	draft := layoutDraft(view)
	noOp, err := f.service.SaveLayout(ctx, f.member, SaveLayoutInput{
		BoardID:          view.Board.ID,
		SaveLayoutFields: draft,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || noOp.Body.Receipt.EventID != nil {
		t.Fatal("layout no-op", err)
	}
	draft.Columns[0].Name = "جاهز"
	draft.Columns = append(draft.Columns, ColumnDraft{
		ID:       command.NewID[command.ColumnKind](),
		Name:     "Waiting for external work",
		StageIDs: []command.StageID{},
		WipMode:  WipWarn,
	})
	input := SaveLayoutInput{BoardID: view.Board.ID, SaveLayoutFields: draft, RetryReference: uuid.NewString()}
	saved, err := f.service.SaveLayout(ctx, f.member, input)
	if err != nil || len(saved.Body.Result.Columns) != 5 || saved.Body.Result.Columns[0].ID != view.Columns[0].ID {
		t.Fatal("layout save", err)
	}
	replay, err := f.service.SaveLayout(ctx, f.member, input)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("layout replay", err)
	}
	input.RetryReference = uuid.NewString()
	if _, err = f.service.SaveLayout(ctx, f.member, input); err == nil {
		t.Fatal("stale layout accepted")
	}
	if _, err = f.service.SaveLayout(ctx, f.other, input); err == nil {
		t.Fatal("noncreator layout edit")
	}
	current, err := f.issues.GetModern(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Revision != issue.Summary.Revision {
		t.Fatal("layout edited content", err)
	}
	created, err := f.service.CreateModernBoard(ctx, f.member, CreateInput{
		ProjectID:      f.project,
		Name:           "New native view",
		SavedFilters:   command.IssueFilter{},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Body.Result.Columns) != 4 {
		t.Fatal("missing default stage mappings")
	}
	cards, err := f.service.NativeCards(ctx, f.viewer, NativeCardsInput{
		BoardID:  created.Body.Result.Board.ID,
		ColumnID: created.Body.Result.Columns[0].ID,
	})
	if err != nil || len(cards.Items) != 1 || cards.Items[0].ID != issue.Summary.ID {
		t.Fatal("new view lost unranked issues", err)
	}
	var defaultID uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id FROM boards WHERE project_id=$1 AND is_default", f.project.UUID).Scan(&defaultID); err != nil {
		t.Fatal(err)
	}
	defaultView, err := f.service.GetLayout(ctx, f.owner, GetInput{BoardID: command.BoardID{UUID: defaultID}})
	if err != nil {
		t.Fatal(err)
	}
	invalid := layoutDraft(defaultView)
	invalid.Columns[0].StageIDs = []command.StageID{}
	if _, err = f.service.SaveLayout(ctx, f.owner, SaveLayoutInput{
		BoardID:          defaultView.Board.ID,
		SaveLayoutFields: invalid,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("default coverage removed")
	}
	if _, err = f.service.Get(ctx, f.member, GetInput{BoardID: view.Board.ID}); err == nil {
		t.Fatal("old editor approximated modern layout")
	}
}
