package activity

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

// A complete key must resolve once through the project/number indexes. Repeated
// cross-issue JSON probes inside each event exhaust the real ordinary deadline
// after an otherwise routine company has accumulated unrelated work/history.
func TestActivityIssueKeyRetainsRelatedHistoryWithDenseUnrelatedWork(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	user := command.NewID[command.UserKind]()
	project := command.NewID[command.ProjectKind]()
	issue := command.NewID[command.IssueKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'density@fixture.test','density@fixture.test','History density admin',now(),true)", user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'FAST','Dense history scope',$2)", project.UUID, user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,7,'Exact target',$3,1024)", issue.UUID, project.UUID, user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO issues(id,project_id,number,title,reporter_id,rank)
SELECT gen_random_uuid(),$1,1000+g,'Unrelated retained work '||g,$2,1024+g FROM generate_series(1,2000) g`, project.UUID, user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes)
SELECT gen_random_uuid(),$1,'web','update_issue','issue',i.id,i.project_id,i.id,'{"version":1,"fields":[{"field":"title","before":"Old","after":"Unrelated"}]}'::jsonb FROM issues i WHERE i.project_id=$2 AND i.id<>$3`, user.UUID, project.UUID, issue.UUID); err != nil {
		t.Fatal(err)
	}

	expected := map[uuid.UUID]bool{}
	add := func(resource string, resourceID uuid.UUID, linked *uuid.UUID, field string) {
		t.Helper()
		id := uuid.New()
		expected[id] = true
		changes, err := json.Marshal(Changes{Version: 1, Fields: []FieldChange{{Field: field, Before: ptr("Before"), After: ptr("After")}}})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, `INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes)
VALUES($1,$2,'web','update_issue',$3,$4,$5,$6,$7)`, id, user.UUID, resource, resourceID, project.UUID, linked, changes); err != nil {
			t.Fatal(err)
		}
	}
	add("issue", issue.UUID, &issue.UUID, "title")
	add("comment", uuid.New(), &issue.UUID, "plainText")
	add("project", project.UUID, nil, "issues."+issue.UUID.String()+".assigneeId")
	add("project", project.UUID, nil, "issues."+project.UUID.String()+"."+issue.UUID.String()+".title")

	signer, err := command.NewCursorSigner([]byte(strings.Repeat("d", 32)))
	if err != nil {
		t.Fatal(err)
	}
	service := New(command.Runner{Pool: pool}, signer)
	actor := command.Actor{UserID: user, Channel: command.REST}
	for _, key := range []string{"FAST-7", "fast-7"} {
		page, err := service.List(ctx, actor, ListInput{IssueKey: &key})
		if err != nil {
			t.Fatalf("exact key exceeded its ordinary deadline or failed: %v", err)
		}
		if page.TotalMatching != int32(len(expected)) || len(page.Items) != len(expected) || page.NextCursor != nil {
			t.Fatalf("exact key did not retain its four direct/related/bulk events: %d/%d", page.TotalMatching, len(page.Items))
		}
		seen := map[uuid.UUID]bool{}
		for _, event := range page.Items {
			if !expected[event.ID.UUID] || seen[event.ID.UUID] {
				t.Fatal("unrelated or duplicated history was returned")
			}
			seen[event.ID.UUID] = true
		}
	}
	for _, key := range []string{"FAST-9223372036854775808", "FAST-999999999999999999999999999", "NONE-7"} {
		page, err := service.List(ctx, actor, ListInput{IssueKey: &key})
		if err != nil || page.TotalMatching != 0 || len(page.Items) != 0 {
			t.Fatalf("missing or overflow key must be an empty view: %v", err)
		}
	}
}
