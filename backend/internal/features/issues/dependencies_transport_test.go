package issues

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestDependencyMCPRESTReplayStrictInputsAndPagedDirections(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	a := f.create(t, "Dependent")
	b := f.create(t, "Blocker")
	input := f.dependencyInput(t, a.Summary.ID, b.Summary.ID)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	actor := f.member
	actor.Channel = command.MCP
	left, right := mcp.NewInMemoryTransports()
	session, err := server.Connect(auth.WithActor(ctx, actor), left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "dependencies", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	result, err := client.CallTool(ctx, &mcp.CallToolParams{Name: "add_dependency", Arguments: input})
	if err != nil || result.IsError {
		t.Fatal(err, result)
	}
	encoded, _ := json.Marshal(result.StructuredContent)
	var original mcpapi.Envelope[command.Saved[DependencyView], IssueFailureBody]
	if err := json.Unmarshal(encoded, &original); err != nil || original.Data == nil {
		t.Fatal("untyped dependency", err)
	}
	mux := http.NewServeMux()
	RegisterHTTP(httpapi.New(mux), f.service)
	fields := AddDependencyFields{
		BlockerID:             input.BlockerID,
		ExpectedIssueRevision: input.ExpectedIssueRevision,
		ExpectedGraphRevision: input.ExpectedGraphRevision,
	}
	encoded, _ = json.Marshal(fields)
	r := httptest.NewRequest("POST", "/api/v1/issues/"+a.Summary.ID.String()+"/dependencies", strings.NewReader(string(encoded)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", input.RetryReference)
	r = r.WithContext(auth.WithActor(r.Context(), f.member))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	var replay command.Saved[DependencyView]
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || *replay.Receipt.EventID != *original.Data.Receipt.EventID {
		t.Fatal("dependency replay changed event", w.Code)
	}
	for i := 0; i < 4; i++ {
		next := f.create(t, "Another blocker")
		if _, err := f.service.AddDependency(ctx, f.member, f.dependencyInput(t, a.Summary.ID, next.Summary.ID)); err != nil {
			t.Fatal(err)
		}
	}
	limit := 2
	page := command.PageRequest{Limit: &limit}
	seen := map[command.IssueID]bool{}
	for {
		out, err := f.service.Dependencies(ctx, f.viewer, ListDependenciesInput{
			IssueID:   a.Summary.ID,
			Direction: BlockedBy,
			Page:      page,
		})
		if err != nil || out.TotalMatching != 5 {
			t.Fatal("page count", err)
		}
		for _, d := range out.Items {
			if seen[d.Blocker.ID] {
				t.Fatal("duplicate blocker")
			}
			seen[d.Blocker.ID] = true
		}
		if out.NextCursor == nil {
			break
		}
		page.Cursor = out.NextCursor
	}
	if len(seen) != 5 {
		t.Fatal("missing blocker")
	}
	current, err := f.service.Get(ctx, f.member, a.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	remove := RemoveDependencyInput{
		IssueID:                    a.Summary.ID,
		BlockerID:                  b.Summary.ID,
		ExpectedIssueRevision:      current.Summary.Revision,
		ExpectedDependencyRevision: 1,
		ExpectedGraphRevision:      current.GraphRevision,
		RetryReference:             uuid.NewString(),
	}
	result, err = client.CallTool(ctx, &mcp.CallToolParams{Name: "remove_dependency", Arguments: remove})
	if err != nil || result.IsError {
		t.Fatal("MCP removal", err)
	}
	encoded, _ = json.Marshal(result.StructuredContent)
	var removed mcpapi.Envelope[command.Saved[DependencyView], IssueFailureBody]
	if err := json.Unmarshal(encoded, &removed); err != nil || removed.Data == nil || !removed.Data.Result.Removed {
		t.Fatal("untyped removed result", err)
	}
	encoded, _ = json.Marshal(RemoveDependencyFields{
		ExpectedIssueRevision:      remove.ExpectedIssueRevision,
		ExpectedDependencyRevision: remove.ExpectedDependencyRevision,
		ExpectedGraphRevision:      remove.ExpectedGraphRevision,
	})
	r = httptest.NewRequest("POST", "/api/v1/issues/"+a.Summary.ID.String()+"/dependencies/"+b.Summary.ID.String()+"/remove", strings.NewReader(string(encoded)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", remove.RetryReference)
	r = r.WithContext(auth.WithActor(r.Context(), f.member))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || *replay.Receipt.EventID != *removed.Data.Receipt.EventID {
		t.Fatal("removed replay changed event", w.Code)
	}
	result, err = client.CallTool(ctx, &mcp.CallToolParams{
		Name: "add_dependency",
		Arguments: map[string]any{
			"issueId":  a.Summary.ID.String(),
			"callerId": f.owner.UserID.String(),
		},
	})
	if err != nil || !result.IsError {
		t.Fatal("unknown authority accepted", err)
	}
}
