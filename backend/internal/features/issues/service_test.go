package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"sync"
	"testing"
	"time"
)

type issueFixture struct {
	service               *Service
	pool                  *pgxpool.Pool
	project               command.ProjectID
	owner, member, viewer command.Actor
}

func issueDatabase(t *testing.T) issueFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("i", 32)))
	f := issueFixture{
		service: New(command.Runner{Pool: pool}, signer),
		pool:    pool,
		project: command.NewID[command.ProjectKind](),
	}
	for i, a := range []*command.Actor{&f.owner, &f.member, &f.viewer} {
		*a = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", a.UserID.UUID, []string{
			"owner@test.dev",
			"member@test.dev",
			"viewer@test.dev",
		}[i], []string{"Owner", "مطور", "Viewer"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Project',$2)", f.project.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	for i, a := range []command.Actor{f.member, f.viewer} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", f.project.UUID, a.UserID.UUID, []string{"member", "viewer"}[i]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	return f
}
func (f issueFixture) create(t *testing.T, title string) IssueView {
	t.Helper()
	out, err := f.service.Create(context.Background(), f.member, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: title},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result
}
func editable(view IssueView) IssueEditable {
	labels := []command.LabelID{}
	for _, l := range view.Summary.Labels {
		labels = append(labels, l.ID)
	}
	var assignee *command.UserID
	if view.Summary.Assignee.Value != nil {
		id := view.Summary.Assignee.Value.ID
		assignee = &id
	}
	return IssueEditable{
		Title:       view.Summary.Title,
		Description: view.Description,
		Type:        view.Summary.Type,
		Priority:    view.Summary.Priority,
		AssigneeID:  assignee,
		DueDate:     view.Summary.DueDate,
		LabelIDs:    labels,
	}
}
func TestIssueDefaultsAttributionReplayAndConcurrentNumbering(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	in := CreateInput{
		ProjectID: f.project,
		CreateIssueFields: CreateIssueFields{
			Title:      "عمل عربي 😀",
			AssigneeID: &f.owner.UserID,
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.service.Create(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	v := first.Body.Result
	if first.HTTPStatus != 201 || v.Summary.Key != "GG-1" || v.Summary.Status != command.Todo || v.Summary.Type != command.Task || v.Summary.Priority != command.Medium || v.Reporter.ID != f.member.UserID || len(v.OrderRevisions) != 4 || v.SourceOrderRevision != 2 || first.Body.Receipt.EventID == nil {
		t.Fatal("incorrect defaults or immutable attribution")
	}
	a := f.member
	a.Channel = command.MCP
	replay, err := f.service.Create(ctx, a, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.ID != v.Summary.ID || *replay.Body.Receipt.EventID != *first.Body.Receipt.EventID {
		t.Fatal("cross-channel replay changed outcome", err)
	}
	var notices int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1", v.Summary.ID.UUID).Scan(&notices); err != nil || notices != 1 {
		t.Fatal("assignment notification was not atomic/deduplicated", err)
	}
	var wg sync.WaitGroup
	results := make(chan command.Revision, 8)
	failures := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := f.service.Create(ctx, f.member, CreateInput{
				ProjectID:         f.project,
				CreateIssueFields: CreateIssueFields{Title: "Concurrent"},
				RetryReference:    uuid.NewString(),
			})
			if err != nil {
				failures <- err
			} else {
				results <- out.Body.Result.Summary.Number
			}
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}
	seen := map[command.Revision]bool{}
	for n := range results {
		if seen[n] || n < 2 || n > 9 {
			t.Fatal("duplicate issue number")
		}
		seen[n] = true
	}
	if len(seen) != 8 {
		t.Fatal("missing concurrent creates")
	}
	in.Title = "Different"
	_, err = f.service.Create(ctx, f.member, in)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.RetryReferenceReused {
		t.Fatal("changed retry input accepted")
	}
}
func TestAssignmentEligibilityNullClearConflictsAndSubtaskIdentity(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	v := f.create(t, "Original")
	in := UpdateInput{
		IssueID:          v.Summary.ID,
		ExpectedRevision: v.Summary.Revision,
		Editable:         editable(v),
		RetryReference:   uuid.NewString(),
	}
	in.Editable.AssigneeID = &f.viewer.UserID
	if _, err := f.service.Update(ctx, f.member, in); err == nil {
		t.Fatal("Viewer assigned")
	}
	in.Editable.AssigneeID = &f.owner.UserID
	in.RetryReference = uuid.NewString()
	saved, err := f.service.Update(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          v.Summary.ID,
		ExpectedRevision: v.Summary.Revision,
		Editable:         editable(v),
		RetryReference:   uuid.NewString(),
	})
	var conflict *IssueConflict
	if !errors.As(err, &conflict) || conflict.Current.Summary.Revision != saved.Body.Result.Summary.Revision {
		t.Fatal("stale replacement did not return authorized current state", err)
	}
	in.ExpectedRevision = saved.Body.Result.Summary.Revision
	in.Editable.AssigneeID = nil
	in.RetryReference = uuid.NewString()
	cleared, err := f.service.Update(ctx, f.member, in)
	if err != nil || cleared.Body.Result.Summary.Assignee.Value != nil || cleared.Body.Result.Reporter.ID != v.Reporter.ID {
		t.Fatal("clear lost attribution", err)
	}
	if _, err := f.service.Create(ctx, f.viewer, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "Denied"},
		RetryReference:    uuid.NewString(),
	}); err == nil {
		t.Fatal("Viewer created issue")
	}
	if _, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "Child", Type: command.Subtask},
		RetryReference:    uuid.NewString(),
	}); err == nil {
		t.Fatal("ordinary Subtask creation")
	}
	child := command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,type,parent_id,reporter_id,rank) VALUES($1,$2,100,'Seed child','subtask',$3,$4,10000)", child.UUID, f.project.UUID, v.Summary.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	childView, err := f.service.Get(ctx, f.member, child)
	if err != nil {
		t.Fatal(err)
	}
	replacement := editable(childView)
	replacement.Type = command.Task
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          child,
		ExpectedRevision: childView.Summary.Revision,
		Editable:         replacement,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("child converted to independent issue")
	}
	replacement.Type = command.Subtask
	replacement.Title = "Child edited"
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          child,
		ExpectedRevision: childView.Summary.Revision,
		Editable:         replacement,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	fresh, err := New(command.Runner{Pool: f.pool}, f.service.cursors).Get(ctx, f.member, v.Summary.ID)
	if err != nil || fresh.Reporter.ID != v.Reporter.ID || fresh.Summary.Key != v.Summary.Key {
		t.Fatal("restart identity changed")
	}
}
func TestIssueUnicodeBoundariesAndNoOp(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	v := f.create(t, strings.Repeat("😀", 200))
	if _, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: strings.Repeat("😀", 201)},
		RetryReference:    uuid.NewString(),
	}); err == nil {
		t.Fatal("overlong Unicode title")
	}
	out, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          v.Summary.ID,
		ExpectedRevision: v.Summary.Revision,
		Editable:         editable(v),
		RetryReference:   uuid.NewString(),
	})
	if err != nil || out.Body.Receipt.EventID != nil || out.Body.Result.Summary.Revision != v.Summary.Revision {
		t.Fatal("no-op emitted event", err)
	}
}
