package activity

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"strings"
	"testing"
	"time"
)

func TestAdminHistoryRetainsActorsAndRelevantChangesWithoutPrivateData(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	admin, member := command.NewID[command.UserKind](), command.NewID[command.UserKind]()
	for i, id := range []command.UserID{admin, member} {
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", id.UUID, []string{"admin@test.dev", "member@test.dev"}[i], []string{"Admin", "مطور"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	project, issue := command.NewID[command.ProjectKind](), command.NewID[command.IssueKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','History',$2)", project.UUID, admin.UUID); err != nil {
		t.Fatal(err)
	}
	insert := func(kind ResourceKind, resource uuid.UUID, fields []FieldChange) command.EventID {
		t.Helper()
		data, err := json.Marshal(Changes{Version: 1, Fields: fields})
		if err != nil {
			t.Fatal(err)
		}
		id := command.NewID[command.EventKind]()
		if _, err := pool.Exec(ctx, "INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,changes,created_at) VALUES($1,$2,'mcp','update_user',$3,$4,$5,$6,$7)", id.UUID, member.UUID, string(kind), resource, project.UUID, data, time.Date(2026, 10, 12, 1, 0, 0, 0, time.UTC)); err != nil {
			t.Fatal(err)
		}
		return id
	}
	old, next, secret := "old", "new", "provider-private-token"
	event := insert(UserResource, member.UUID, []FieldChange{
		{
			Field:  "displayName",
			Before: &old,
			After:  &next,
		},
		{
			Field:  "issues." + project.String() + "." + issue.String() + ".assigneeId",
			Before: &old,
		},
		{Field: "accessToken", After: &secret},
	})
	insert(NotificationResource, uuid.New(), []FieldChange{{Field: "body", After: &secret}})
	for i := 0; i < 4; i++ {
		insert(IssueResource, issue.UUID, []FieldChange{{Field: "title", Before: &old, After: &next}})
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("a", 32)))
	service := New(command.Runner{Pool: pool}, signer)
	actor := command.Actor{UserID: admin, Channel: command.REST}
	if _, err := pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", member.UUID); err != nil {
		t.Fatal(err)
	}
	size := 2
	input := ListInput{
		Page:         command.PageRequest{Limit: &size},
		ResourceKind: ptr(IssueResource),
		ResourceID:   &ResourceID{UUID: issue.UUID},
	}
	seen := map[command.EventID]bool{}
	var firstCursor *string
	for {
		page, err := service.List(ctx, actor, input)
		if err != nil || page.TotalMatching != 5 {
			t.Fatal("relevant count", err)
		}
		if firstCursor == nil {
			firstCursor = page.NextCursor
		}
		for _, v := range page.Items {
			if seen[v.ID] || v.Actor.ID != member || v.Actor.DisplayName != "مطور" {
				t.Fatal("lost attribution or duplicate")
			}
			seen[v.ID] = true
			if v.ID == event && (len(v.Changes) != 1 || !strings.HasSuffix(v.Changes[0].Field, ".assigneeId")) {
				t.Fatal("irrelevant fields escaped")
			}
			data, _ := json.Marshal(v)
			if strings.Contains(string(data), secret) {
				t.Fatal("private data escaped")
			}
		}
		if page.NextCursor == nil {
			break
		}
		input.Page.Cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatal("missing history")
	}
	page, err := service.List(ctx, actor, ListInput{})
	if err != nil || page.TotalMatching != 6 {
		t.Fatal("read-state event metadata missing", err)
	}
	_, err = service.List(ctx, command.Actor{UserID: member, Channel: command.MCP}, ListInput{})
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.AccountInactive {
		t.Fatal("disabled caller accessed history")
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET disabled_at=NULL WHERE id=$1", member.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = service.List(ctx, command.Actor{UserID: member, Channel: command.MCP}, ListInput{})
	if !errors.As(err, &failure) || failure.Code != command.Forbidden {
		t.Fatal("non-Admin accessed history")
	}
	_, err = service.List(ctx, actor, ListInput{ResourceKind: ptr(IssueResource)})
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("unpaired resource accepted")
	}
	for _, v := range page.Items {
		data, _ := json.Marshal(v)
		if strings.Contains(string(data), secret) {
			t.Fatal("private provider/inbox body escaped root history")
		}
	}
	other := ResourceID{UUID: uuid.New()}
	input.ResourceID = &other
	input.Page.Cursor = firstCursor
	_, err = service.List(ctx, actor, input)
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("cursor crossed resource scope")
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET is_administrator=false WHERE id=$1", admin.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = service.List(ctx, actor, ListInput{})
	if !errors.As(err, &failure) || failure.Code != command.Forbidden {
		t.Fatal("stale Admin privilege accepted")
	}
}
func ptr[T any](value T) *T { return &value }

func TestHistoryProjectionHasExplicitBoundsAndPreservesUnicode(t *testing.T) {
	value := strings.Repeat("😀ع", 3000)
	fields := []FieldChange{}
	for i := 0; i < 100; i++ {
		fields = append(fields, FieldChange{Field: "description", After: &value})
	}
	data, _ := json.Marshal(Changes{Version: 1, Fields: fields})
	changes, summary, err := projectChanges(data)
	if err != nil || len(changes) > 50 || len([]rune(*changes[0].After)) > 1025 || !strings.Contains(summary, "abbreviated") {
		t.Fatal("unbounded history", err)
	}
	if !json.Valid(data) {
		t.Fatal("invalid Unicode")
	}
}
