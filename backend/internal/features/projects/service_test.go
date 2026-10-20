package projects

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type projectFixture struct {
	service               *Service
	pool                  *pgxpool.Pool
	owner, member, viewer command.Actor
}

func projectDatabase(t *testing.T) projectFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	f := projectFixture{service: New(command.Runner{Pool: pool}, signer), pool: pool}
	actors := []*command.Actor{&f.owner, &f.member, &f.viewer}
	for i, actor := range actors {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", actor.UserID.UUID, []string{
			"owner@example.test",
			"member@example.test",
			"viewer@example.test",
		}[i], []string{"Owner", "عضو", "Viewer"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	return f
}
func (f projectFixture) create(t *testing.T, key, name string) ProjectView {
	t.Helper()
	out, err := f.service.Create(context.Background(), f.owner, CreateInput{
		Key:            key,
		Name:           name,
		Description:    "Plain <b>text</b> وصف",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result
}
func TestProjectCreationDefaultsAndCrossChannelReplay(t *testing.T) {
	f := projectDatabase(t)
	ctx := context.Background()
	input := CreateInput{Key: "gg", Name: "بوابة الذهب 😀", RetryReference: uuid.NewString()}
	first, err := f.service.Create(ctx, f.owner, input)
	if err != nil {
		t.Fatal(err)
	}
	if first.HTTPStatus != 201 || first.Body.Result.Key != "GG" || first.Body.Result.Description != "" || first.Body.Result.EffectiveRole != Administrator || first.Body.Receipt.EventID == nil {
		t.Fatal("bad project defaults")
	}
	actor := f.owner
	actor.Channel = command.MCP
	replay, err := f.service.Create(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != first.Body.Result.ID || replay.HTTPStatus != 201 || *replay.Body.Receipt.EventID != *first.Body.Receipt.EventID {
		t.Fatal("project replay lost original outcome", err)
	}
	var boards, orders, events int
	if err := f.pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM boards WHERE project_id=$1 AND is_default AND name='All Issues' AND saved_filters='{}'::jsonb AND in_progress_limit IS NULL AND review_limit IS NULL),(SELECT count(*) FROM project_status_order WHERE project_id=$1),(SELECT count(*) FROM activity_events WHERE project_id=$1)", first.Body.Result.ID.UUID).Scan(&boards, &orders, &events); err != nil {
		t.Fatal(err)
	}
	if boards != 1 || orders != 4 || events != 1 {
		t.Fatal("default board/order/event not atomic")
	}
	input.RetryReference = uuid.NewString()
	if _, err := f.service.Create(ctx, f.owner, input); err == nil {
		t.Fatal("duplicate normalized key accepted")
	}
	if _, err := f.service.Create(ctx, f.member, CreateInput{
		Key:            "NO",
		Name:           "Denied",
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("Member created company project")
	}
}
func TestArchiveRestoreRetainsContentAndReportsAuthorizedConflict(t *testing.T) {
	f := projectDatabase(t)
	ctx := context.Background()
	project := f.create(t, "GG", "Project")
	if _, err := f.pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member');", project.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	issue := uuid.New()
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,1,'Retained',$3,1024)", issue, project.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	archived, err := f.service.Archive(ctx, f.owner, RevisionInput{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || !archived.Body.Result.Archived {
		t.Fatal(err)
	}
	if _, err := f.service.Update(ctx, f.owner, UpdateInput{
		ProjectID:        project.ID,
		ExpectedRevision: archived.Body.Result.Revision,
		Name:             "Not writable",
		Description:      "",
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("archived project editable")
	}
	if current, err := f.service.Get(ctx, f.member, project.ID); err != nil || !current.Archived {
		t.Fatal("member lost archived read", err)
	}
	if page, err := f.service.List(ctx, f.member, ListInput{}); err != nil || len(page.Items) != 0 {
		t.Fatal("default active list contains archive", err)
	}
	if page, err := f.service.List(ctx, f.member, ListInput{IncludeArchived: true}); err != nil || len(page.Items) != 1 {
		t.Fatal("archived membership visibility lost", err)
	}
	_, err = f.service.Restore(ctx, f.owner, RevisionInput{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		RetryReference:   uuid.NewString(),
	})
	var conflict *ConflictError
	if !errors.As(err, &conflict) || conflict.Current == nil || !conflict.Current.Archived {
		t.Fatal("no current authorized conflict", err)
	}
	restored, err := f.service.Restore(ctx, f.owner, RevisionInput{
		ProjectID:        project.ID,
		ExpectedRevision: archived.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || restored.Body.Result.Archived {
		t.Fatal(err)
	}
	var retained int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE id=$1", issue).Scan(&retained); err != nil || retained != 1 {
		t.Fatal("archive erased content", err)
	}
	if _, err := f.service.Get(ctx, f.viewer, project.ID); err == nil {
		t.Fatal("unrelated Viewer learned a project")
	}
	if _, err := f.service.Get(ctx, f.viewer, command.NewID[command.ProjectKind]()); err == nil {
		t.Fatal("missing project exposed")
	}
}
func TestProjectArchiveAndEditSerializeAtRevision(t *testing.T) {
	f := projectDatabase(t)
	project := f.create(t, "GG", "Project")
	start := make(chan struct{})
	results := make(chan error, 2)
	var workers sync.WaitGroup
	workers.Add(2)
	go func() {
		defer workers.Done()
		<-start
		_, err := f.service.Archive(context.Background(), f.owner, RevisionInput{
			ProjectID:        project.ID,
			ExpectedRevision: 1,
			RetryReference:   uuid.NewString(),
		})
		results <- err
	}()
	go func() {
		defer workers.Done()
		<-start
		_, err := f.service.Update(context.Background(), f.owner, UpdateInput{
			ProjectID:        project.ID,
			ExpectedRevision: 1,
			Name:             "Edited",
			Description:      "",
			RetryReference:   uuid.NewString(),
		})
		results <- err
	}()
	close(start)
	workers.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else {
			var failure *command.Failure
			if !errors.As(err, &failure) || (failure.Code != command.Conflict && failure.Code != command.Forbidden) {
				t.Fatal(err)
			}
		}
	}
	if success != 1 {
		t.Fatal("both competing writes succeeded")
	}
}
func TestProjectPaginationAndUnicodeBoundaries(t *testing.T) {
	f := projectDatabase(t)
	ctx := context.Background()
	for i, key := range []string{"AA", "AB", "AC", "AD", "AE"} {
		f.create(t, key, []string{"مشروع", "Project", "😀", "Project", "بوابة"}[i])
	}
	limit := 2
	input := ListInput{Page: command.PageRequest{Limit: &limit}}
	seen := map[command.ProjectID]bool{}
	for {
		page, err := f.service.List(ctx, f.owner, input)
		if err != nil {
			t.Fatal(err)
		}
		if page.TotalMatching != 5 || len(page.Items) > 2 {
			t.Fatal("wrong bounded count")
		}
		for _, item := range page.Items {
			if seen[item.ID] {
				t.Fatal("duplicate page item")
			}
			seen[item.ID] = true
		}
		if page.NextCursor == nil {
			break
		}
		input.Page.Cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatal("pagination skipped a project")
	}
	if _, err := f.service.Create(ctx, f.owner, CreateInput{
		Key:            "OK",
		Name:           strings.Repeat("😀", 100),
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal("valid Unicode rejected", err)
	}
	if _, err := f.service.Create(ctx, f.owner, CreateInput{
		Key:            "NO",
		Name:           strings.Repeat("😀", 101),
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("overlong Unicode accepted")
	}
}
