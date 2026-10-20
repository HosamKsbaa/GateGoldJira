package projects

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

func TestProjectAdaptersShareTypedServicesAndRoles(t *testing.T) {
	f := projectDatabase(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(api.OpenAPI())
	for _, op := range []string{
		"list_projects",
		"get_project",
		"create_project",
		"update_project",
		"archive_project",
		"restore_project",
	} {
		if !strings.Contains(string(encoded), `"operationId":"`+op+`"`) {
			t.Fatal("missing REST operation", op)
		}
	}
	st, ct := mcp.NewInMemoryTransports()
	actor := f.owner
	actor.Channel = command.MCP
	ss, err := server.Connect(auth.WithActor(context.Background(), actor), st, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ss.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "project-contract", Version: "1"}, nil).Connect(context.Background(), ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tools, err := client.ListTools(context.Background(), nil)
	if err != nil || len(tools.Tools) != 6 {
		t.Fatal("wrong project tool catalog", err)
	}
	ref := uuid.NewString()
	result, err := client.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "create_project",
		Arguments: CreateInput{
			Key:            "GG",
			Name:           "بوابة",
			RetryReference: ref,
		},
	})
	if err != nil || result.IsError {
		t.Fatal("MCP creation failed", err)
	}
	encoded, _ = json.Marshal(result.StructuredContent)
	var created mcpapi.Envelope[command.Saved[ProjectView], ProjectFailureBody]
	if err := json.Unmarshal(encoded, &created); err != nil || created.Data == nil {
		t.Fatal("untyped creation", err)
	}
	r := httptest.NewRequest("GET", "/api/v1/projects/"+created.Data.Result.ID.String(), nil)
	r = r.WithContext(auth.WithActor(r.Context(), f.owner))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	var read ProjectView
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &read) != nil || read.Name != "بوابة" {
		t.Fatal("REST did not see MCP creation", w.Code)
	}
	r = httptest.NewRequest("POST", "/api/v1/projects", strings.NewReader(`{"key":"GG","name":"بوابة"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", ref)
	r = r.WithContext(auth.WithActor(r.Context(), f.owner))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	var replay command.Saved[ProjectView]
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || replay.Result.ID != read.ID {
		t.Fatal("REST/MCP replay mismatch", w.Code, w.Body.String())
	}
	r = httptest.NewRequest("POST", "/api/v1/projects", strings.NewReader(`{"key":"HI","name":"Test","callerId":"not-authority"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", uuid.NewString())
	r = r.WithContext(auth.WithActor(r.Context(), f.owner))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 422 {
		t.Fatal("unknown caller field accepted", w.Code)
	}
}
