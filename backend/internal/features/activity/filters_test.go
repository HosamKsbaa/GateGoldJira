package activity

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestReadableActivityFiltersIssueKeyCompanyDatesAndCursorScope(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	user := command.NewID[command.UserKind]()
	project := command.NewID[command.ProjectKind]()
	issue := command.NewID[command.IssueKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'admin@fixture.test','admin@fixture.test','سارة',now(),true)", user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'READ','Readable work',$2)", project.UUID, user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,7,'تسليم المشروع',$3,1024)", issue.UUID, project.UUID, user.UUID); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(Changes{
		Version: 1,
		Fields: []FieldChange{{
			Field:  "title",
			Before: ptr("Before"),
			After:  ptr("After"),
		}},
	})
	// Cairo is UTC+3 on this date: 22:00 UTC belongs to the next company day.
	for _, created := range []time.Time{
		time.Date(2026, 10, 12, 22, 0, 0, 0, time.UTC),
		time.Date(2026, 10, 13, 5, 0, 0, 0, time.UTC),
		time.Date(2026, 10, 13, 23, 0, 0, 0, time.UTC),
	} {
		if _, err := pool.Exec(ctx, "INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes,created_at) VALUES($1,$2,'web','update_issue','issue',$3,$4,$3,$5,$6)", uuid.New(), user.UUID, issue.UUID, project.UUID, data, created); err != nil {
			t.Fatal(err)
		}
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("a", 32)))
	service := New(command.Runner{Pool: pool}, signer)
	date, _ := command.ParseDate("2026-10-13")
	size := 1
	key := "read-7"
	in := ListInput{Page: command.PageRequest{Limit: &size}, IssueKey: &key, FromDate: &date, ToDate: &date}
	actor := command.Actor{UserID: user, Channel: command.REST}
	page, err := service.List(ctx, actor, in)
	if err != nil || page.TotalMatching != 2 || len(page.Items) != 1 || page.NextCursor == nil {
		t.Fatal("company-date filtered page", err, page)
	}
	item := page.Items[0]
	if item.IssueKey == nil || *item.IssueKey != "READ-7" || item.ProjectName == nil || *item.ProjectName != "Readable work" || item.ResourceName != "تسليم المشروع" || item.ActionSummary != "updated an issue" {
		t.Fatal("readable history", item)
	}
	in.Page.Cursor = page.NextCursor
	next, err := service.List(ctx, actor, in)
	if err != nil || len(next.Items) != 1 || next.Items[0].ID == item.ID {
		t.Fatal("next page", err)
	}
	other, _ := command.ParseDate("2026-10-14")
	in.ToDate = &other
	if _, err = service.List(ctx, actor, in); err == nil {
		t.Fatal("cursor crossed date filter")
	}
}
