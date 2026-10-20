package boards

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

func TestBoardAdaptersPublishThirteenConcreteOperations(t *testing.T) {
	f := boardDatabase(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	left, right := mcp.NewInMemoryTransports()
	actor := f.member
	actor.Channel = command.MCP
	session, err := server.Connect(auth.WithActor(context.Background(), actor), left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "board-test", Version: "1"}, nil).Connect(context.Background(), right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tools, err := client.ListTools(context.Background(), nil)
	if err != nil || len(tools.Tools) != 13 {
		t.Fatal("missing board tool", err)
	}
	ref := uuid.NewString()
	result, err := client.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "create_board",
		Arguments: CreateInput{
			ProjectID:      f.project,
			Name:           "MCP board",
			SavedFilters:   command.IssueFilter{},
			RetryReference: ref,
		},
	})
	if err != nil || result.IsError {
		t.Fatal("MCP create", err)
	}
	encoded, _ := json.Marshal(result.StructuredContent)
	var out mcpapi.Envelope[command.Saved[BoardSummary], BoardFailureBody]
	if json.Unmarshal(encoded, &out) != nil || out.Data == nil {
		t.Fatal("untyped board response")
	}
	request := httptest.NewRequest("POST", "/api/v1/projects/"+f.project.String()+"/boards", strings.NewReader(`{"name":"MCP board","savedFilters":{}}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", ref)
	request = request.WithContext(auth.WithActor(request.Context(), f.member))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	var replay command.Saved[BoardSummary]
	if response.Code != 201 || json.Unmarshal(response.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || replay.Result.ID != out.Data.Result.ID {
		t.Fatal("board replay parity", response.Code)
	}
}
