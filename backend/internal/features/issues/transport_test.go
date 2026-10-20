package issues

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIssueSearchFiltersPagingAndHiddenProjects(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	one := f.create(t, "بحث First")
	f.create(t, "بحث Second")
	third := f.create(t, "Unrelated")
	date, _ := command.ParseDate("2020-01-01")
	in := editable(one)
	in.DueDate = &date
	in.AssigneeID = &f.member.UserID
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          one.Summary.ID,
		ExpectedRevision: one.Summary.Revision,
		Editable:         in,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	query := "بحث"
	overdue := true
	filters := command.IssueFilter{
		Query:    &query,
		Assignee: &command.AssigneeFilter{Mode: command.AssigneeMe},
		Overdue:  &overdue,
		Statuses: []command.Status{command.Todo},
	}
	out, err := f.service.Search(ctx, f.member, SearchInput{Filters: filters})
	if err != nil || len(out.Items) != 1 || out.Items[0].ID != one.Summary.ID {
		t.Fatal("AND filters did not intersect", err)
	}
	key := third.Summary.Key
	byKey, err := f.service.Search(ctx, f.member, SearchInput{Filters: command.IssueFilter{Query: &key}})
	if err != nil || len(byKey.Items) != 1 || byKey.Items[0].ID != third.Summary.ID {
		t.Fatal("exact key search", err)
	}
	limit := 1
	page := command.PageRequest{Limit: &limit}
	seen := map[command.IssueID]bool{}
	for {
		result, err := f.service.Search(ctx, f.viewer, SearchInput{Filters: command.IssueFilter{}, Page: page})
		if err != nil {
			t.Fatal(err)
		}
		if result.TotalMatching != 3 {
			t.Fatal("count predicate differs")
		}
		for _, v := range result.Items {
			if seen[v.ID] {
				t.Fatal("duplicate unchanged-set page")
			}
			seen[v.ID] = true
		}
		if result.NextCursor == nil {
			break
		}
		page.Cursor = result.NextCursor
	}
	if len(seen) != 3 {
		t.Fatal("missing page")
	}
	foreign := command.NewID[command.ProjectKind]()
	none, err := f.service.Search(ctx, f.viewer, SearchInput{Filters: command.IssueFilter{ProjectIDs: []command.ProjectID{foreign}}})
	if err != nil || len(none.Items) != 0 || none.TotalMatching != 0 {
		t.Fatal("inaccessible project leaked", err)
	}
	raw, _ := json.Marshal(one)
	var body struct {
		Summary map[string]json.RawMessage `json:"summary"`
	}
	json.Unmarshal(raw, &body)
	for _, name := range []string{"assignee", "dueDate", "parent"} {
		if string(body.Summary[name]) != "null" {
			t.Fatal("missing explicit null", name)
		}
	}
}

func TestIssueDateLabelParentAndBlockedIntersections(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	parent := f.create(t, "Parent")
	blocker := f.create(t, "Blocker")
	label := command.NewID[command.LabelKind]()
	date, _ := command.ParseDate("2020-01-01")
	if _, err := f.pool.Exec(ctx, "INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,'عاجل','عاجل',$3)", label.UUID, f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	child := command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,type,priority,parent_id,reporter_id,due_date,rank) VALUES($1,$2,100,'Child','subtask','high',$3,$4,'2020-01-01',9000)", child.UUID, f.project.UUID, parent.Summary.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_labels(project_id,issue_id,label_id) VALUES($1,$2,$3)", f.project.UUID, child.UUID, label.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4)", f.project.UUID, child.UUID, blocker.Summary.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	blocked := true
	overdue := true
	filters := command.IssueFilter{
		ProjectIDs: []command.ProjectID{f.project},
		ParentID:   &parent.Summary.ID,
		LabelIDs:   []command.LabelID{label},
		Types:      []command.IssueType{command.Subtask},
		Priorities: []command.Priority{command.High},
		DueFrom:    &date,
		DueTo:      &date,
		Blocked:    &blocked,
		Overdue:    &overdue,
		Assignee:   &command.AssigneeFilter{Mode: command.Unassigned},
	}
	page, err := f.service.Search(ctx, f.member, SearchInput{Filters: filters})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != child || page.Items[0].UnfinishedBlockerCount != 1 || page.Items[0].Parent.Value == nil {
		t.Fatal("combined filters/projection mismatch", err)
	}
	parentView, err := f.service.Get(ctx, f.member, parent.Summary.ID)
	if err != nil || parentView.Summary.SubtaskProgress.Total != 1 || parentView.Summary.SubtaskProgress.Done != 0 {
		t.Fatal("child aggregate mismatch", err)
	}
	blocked = false
	none, err := f.service.Search(ctx, f.member, SearchInput{Filters: filters})
	if err != nil || none.TotalMatching != 0 || len(none.Items) != 0 {
		t.Fatal("false blocked filter ignored", err)
	}
	filters.LabelIDs = []command.LabelID{command.NewID[command.LabelKind]()}
	none, err = f.service.Search(ctx, f.member, SearchInput{Filters: filters})
	if err != nil || len(none.Items) != 0 {
		t.Fatal("unknown label broadened search", err)
	}
	filters = command.IssueFilter{DueFrom: &date}
	earlier, _ := command.ParseDate("2019-12-31")
	filters.DueTo = &earlier
	if _, err := f.service.Search(ctx, f.member, SearchInput{Filters: filters}); err == nil {
		t.Fatal("reversed date range accepted")
	}
}
func TestIssueRESTMCPStrictInputsAndReplay(t *testing.T) {
	f := issueDatabase(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	ref := uuid.NewString()
	body := `{"title":"REST issue"}`
	call := func(payload, reference string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v1/projects/"+f.project.String()+"/issues", strings.NewReader(payload))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", reference)
		r = r.WithContext(auth.WithActor(r.Context(), f.member))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	w := call(body, ref)
	var saved command.Saved[IssueView]
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &saved) != nil {
		t.Fatal("REST creation", w.Code, w.Body.String())
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.Create(context.Background(), actor, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "REST issue"},
		RetryReference:    ref,
	})
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.ID != saved.Result.Summary.ID {
		t.Fatal("REST/MCP service replay mismatch", err)
	}
	if call(`{"title":"Unknown","status":"done"}`, uuid.NewString()).Code != 422 {
		t.Fatal("immutable status field accepted")
	}
	r := httptest.NewRequest("PUT", "/api/v1/issues/"+saved.Result.Summary.ID.String(), strings.NewReader(`{"expectedRevision":"1","editable":{"title":"Partial"}}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", uuid.NewString())
	r = r.WithContext(auth.WithActor(r.Context(), f.member))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 422 {
		t.Fatal("partial full replacement accepted", w.Code)
	}
}
func TestIssueMCPProviderIsConcrete(t *testing.T) {
	f := issueDatabase(t)
	ctx := auth.WithActor(context.Background(), f.member)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	left, right := mcp.NewInMemoryTransports()
	session, err := server.Connect(ctx, left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "issue-test", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tools, err := client.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 36 {
		t.Fatal("thirty-six concrete issue tools missing", err)
	}
	for _, operation := range []command.Operation{
		command.GetCustomFields,
		command.SaveCustomFields,
		command.GetApprovalContext,
		command.VoteApproval,
		command.ResubmitApproval,
		command.ListBacklog,
		command.ReorderBacklog,
		command.PreviewIssueImport,
		command.ImportIssues,
		command.ExportIssues,
	} {
		found := false
		for _, tool := range tools.Tools {
			if tool.Name == string(operation) {
				found = true
			}
		}
		if !found {
			t.Fatal("audit issue operation missing", operation)
		}
	}
	ref := uuid.NewString()
	args := map[string]any{"projectId": f.project.String(), "title": "MCP issue", "retryReference": ref}
	out, err := client.CallTool(ctx, &mcp.CallToolParams{Name: string(command.CreateIssue), Arguments: args})
	if err != nil || out.IsError {
		t.Fatal("MCP create", err)
	}
	args["callerId"] = f.owner.UserID.String()
	bad, err := client.CallTool(ctx, &mcp.CallToolParams{Name: string(command.CreateIssue), Arguments: args})
	if err != nil || !bad.IsError {
		t.Fatal("caller override accepted", err)
	}
}
