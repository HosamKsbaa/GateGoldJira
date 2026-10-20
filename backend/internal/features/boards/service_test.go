package boards

import (
	"context"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"testing"
	"time"
)

type boardFixture struct {
	service                      *Service
	issues                       *issues.Service
	pool                         *pgxpool.Pool
	project                      command.ProjectID
	owner, member, other, viewer command.Actor
}

func boardDatabase(t *testing.T) boardFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("b", 32)))
	f := boardFixture{pool: pool}
	for i, a := range []*command.Actor{&f.owner, &f.member, &f.other, &f.viewer} {
		*a = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		email := uuid.NewString() + "@test.dev"
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", a.UserID.UUID, email, []string{
			"Owner",
			"Creator",
			"Other Member",
			"Viewer",
		}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	project, err := projects.New(command.Runner{Pool: pool}, signer).Create(ctx, f.owner, projects.CreateInput{
		Key:            "GG",
		Name:           "Project",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	f.project = project.Body.Result.ID
	for i, a := range []command.Actor{f.member, f.other, f.viewer} {
		role := "member"
		if i == 2 {
			role = "viewer"
		}
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", f.project.UUID, a.UserID.UUID, role); err != nil {
			t.Fatal(err)
		}
	}
	f.issues = issues.New(command.Runner{Pool: pool, WriteGuard: GuardWIP}, signer)
	f.service = New(command.Runner{Pool: pool, WriteGuard: GuardWIP}, signer, issues.Summary)
	f.issues.WithBoards(f.service.Access())
	return f
}
func (f boardFixture) create(t *testing.T, name string, filter command.IssueFilter) BoardView {
	t.Helper()
	out, err := f.service.Create(context.Background(), f.member, CreateInput{
		ProjectID:      f.project,
		Name:           name,
		SavedFilters:   filter,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	view, err := f.service.Get(context.Background(), f.member, GetInput{BoardID: out.Body.Result.ID})
	if err != nil {
		t.Fatal(err)
	}
	return view
}
func (f boardFixture) issue(t *testing.T, title string, priority command.Priority) command.IssueView {
	t.Helper()
	out, err := f.issues.Create(context.Background(), f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: title, Priority: priority},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result
}
func TestBoardOwnershipDefaultAndArchiveRetention(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, " لوحة الفريق ", command.IssueFilter{})
	if board.Board.Name != "لوحة الفريق" || !board.Board.CanManage || board.Board.Creator.ID != f.member.UserID || len(board.Columns) != 4 || board.Board.WipLimits.InProgress != nil {
		t.Fatal("incorrect board defaults")
	}
	if _, err := f.service.Create(ctx, f.other, CreateInput{
		ProjectID:      f.project,
		Name:           "لوحة الفريق",
		SavedFilters:   command.IssueFilter{},
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("duplicate normalized name")
	}
	in := UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             "New name",
		SavedFilters:     command.IssueFilter{},
		WipLimits:        Limits{},
		RetryReference:   uuid.NewString(),
	}
	if _, err := f.service.Update(ctx, f.other, in); err == nil {
		t.Fatal("noncreator Member managed board")
	}
	one := int32(1)
	in.WipLimits = Limits{InProgress: &one, Review: &one}
	saved, err := f.service.Update(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	in.RetryReference = uuid.NewString()
	_, err = f.service.Update(ctx, f.member, in)
	var stale *BoardConflict
	if !errors.As(err, &stale) || stale.Current.Revision != saved.Body.Result.Revision {
		t.Fatal("board conflict missing current", err)
	}
	archived, err := f.service.Archive(ctx, f.member, RevisionInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: saved.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || !archived.Body.Result.Archived {
		t.Fatal(err)
	}
	read, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: board.Board.ID})
	if err != nil || !read.Board.Archived || read.Board.CanManage {
		t.Fatal("archived reader/ownership", err)
	}
	restored, err := f.service.Restore(ctx, f.owner, RevisionInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: archived.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || restored.Body.Result.Name != "New name" || *restored.Body.Result.WipLimits.Review != 1 {
		t.Fatal("restore lost settings", err)
	}
	list, err := f.service.List(ctx, f.viewer, ListInput{ProjectID: f.project})
	if err != nil || len(list.Items) != 2 {
		t.Fatal("default and named boards missing", err)
	}
	for _, b := range list.Items {
		if b.Default {
			if _, err := f.service.Archive(ctx, f.owner, RevisionInput{
				BoardID:          b.ID,
				ExpectedRevision: b.Revision,
				RetryReference:   uuid.NewString(),
			}); err == nil {
				t.Fatal("default archived")
			}
			if _, err := f.service.Update(ctx, f.member, UpdateInput{
				BoardID:          b.ID,
				ExpectedRevision: b.Revision,
				Name:             "All Issues",
				SavedFilters:     command.IssueFilter{},
				WipLimits:        Limits{Review: &one},
				RetryReference:   uuid.NewString(),
			}); err == nil {
				t.Fatal("default managed by nonAdmin")
			}
		}
	}
}
func TestBoardSavedCountsTemporaryIntersectionAndOrderCursor(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	a := f.issue(t, "High A", command.High)
	b := f.issue(t, "High B", command.High)
	f.issue(t, "Hidden Medium", command.Medium)
	board := f.create(t, "High", command.IssueFilter{Priorities: []command.Priority{command.High}})
	q := "A"
	view, err := f.service.Get(ctx, f.member, GetInput{
		BoardID:          board.Board.ID,
		TemporaryFilters: command.IssueFilter{Query: &q},
	})
	if err != nil || view.Columns[0].SavedMatchCount != 2 || view.Columns[0].VisibleMatchCount != 1 {
		t.Fatal("temporary filter changed saved counts", err)
	}
	limit := 1
	cards, err := f.service.Cards(ctx, f.member, CardsInput{
		BoardID: board.Board.ID,
		Status:  command.Todo,
		Page:    command.PageRequest{Limit: &limit},
	})
	if err != nil || len(cards.Items) != 1 || cards.NextCursor == nil || cards.Items[0].ID != a.Summary.ID {
		t.Fatal("rank page", err)
	}
	moved, err := f.issues.Move(ctx, f.member, issues.MoveInput{
		IssueID:                     b.Summary.ID,
		ExpectedRevision:            b.Summary.Revision,
		TargetStatus:                command.Review,
		ExpectedSourceOrderRevision: board.Columns[0].OrderRevision,
		ExpectedTargetOrderRevision: board.Columns[2].OrderRevision,
		RetryReference:              uuid.NewString(),
	})
	if err != nil || moved.Body.Result.Issue.Summary.Status != command.Review {
		t.Fatal(err)
	}
	if _, err := f.service.Cards(ctx, f.member, CardsInput{
		BoardID: board.Board.ID,
		Status:  command.Todo,
		Page:    command.PageRequest{Limit: &limit, Cursor: cards.NextCursor},
	}); err == nil {
		t.Fatal("stale order cursor accepted")
	}
}
func TestReviewWIPIsSoftAndArchivedSourceCannotMove(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	a := f.issue(t, "A", command.High)
	b := f.issue(t, "B", command.High)
	board := f.create(t, "Review flow", command.IssueFilter{})
	one := int32(1)
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             board.Board.Name,
		SavedFilters:     command.IssueFilter{},
		WipLimits:        Limits{Review: &one},
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	board, err = f.service.Get(ctx, f.member, GetInput{BoardID: saved.Body.Result.ID})
	if err != nil {
		t.Fatal(err)
	}
	move := func(v command.IssueView) command.MoveResult {
		t.Helper()
		fresh, err := f.issues.Get(ctx, f.member, v.Summary.ID)
		if err != nil {
			t.Fatal(err)
		}
		var target command.Revision
		for _, o := range fresh.OrderRevisions {
			if o.Status == command.Review {
				target = o.Revision
			}
		}
		out, err := f.issues.Move(ctx, f.member, issues.MoveInput{
			IssueID:                     v.Summary.ID,
			ExpectedRevision:            fresh.Summary.Revision,
			TargetStatus:                command.Review,
			ExpectedSourceOrderRevision: fresh.SourceOrderRevision,
			ExpectedTargetOrderRevision: target,
			SourceBoardID:               &board.Board.ID,
			ExpectedBoardRevision:       &board.Board.Revision,
			RetryReference:              uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
		return out.Body.Result
	}
	first := move(a)
	if first.BoardView.Value == nil || first.BoardView.Value.Columns[2].LimitExceeded {
		t.Fatal("equal limit warned")
	}
	second := move(b)
	if second.BoardView.Value == nil || !second.BoardView.Value.Columns[2].LimitExceeded || second.BoardView.Value.Columns[2].SavedMatchCount != 2 {
		t.Fatal("soft WIP warning missing")
	}
	archived, err := f.service.Archive(ctx, f.member, RevisionInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := f.issues.Get(ctx, f.member, a.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	target := fresh.OrderRevisions[0].Revision
	if _, err := f.issues.Move(ctx, f.member, issues.MoveInput{
		IssueID:                     a.Summary.ID,
		ExpectedRevision:            fresh.Summary.Revision,
		TargetStatus:                command.Todo,
		ExpectedSourceOrderRevision: fresh.SourceOrderRevision,
		ExpectedTargetOrderRevision: target,
		SourceBoardID:               &board.Board.ID,
		ExpectedBoardRevision:       &archived.Body.Result.Revision,
		RetryReference:              uuid.NewString(),
	}); err == nil {
		t.Fatal("archived source board moved content")
	}
}
