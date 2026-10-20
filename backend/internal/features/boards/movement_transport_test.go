package boards

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMovementRESTMCPReplayAndCurrentBoardFailure(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	a := f.issue(t, "A", command.High)
	b := f.issue(t, "B", command.High)
	board := f.create(t, "Shared", command.IssueFilter{})
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	issues.RegisterHTTP(api, f.issues)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	if err := issues.RegisterMCP(server, f.issues); err != nil {
		t.Fatal(err)
	}
	actor := f.owner
	actor.Channel = command.MCP
	left, right := mcp.NewInMemoryTransports()
	session, err := server.Connect(auth.WithActor(ctx, actor), left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "movement-parity", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	callREST := func(id command.IssueID, action, reference string, fields any) *httptest.ResponseRecorder {
		encoded, err := json.Marshal(fields)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest("POST", "/api/v1/issues/"+id.String()+"/"+action, strings.NewReader(string(encoded)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", reference)
		r = r.WithContext(auth.WithActor(r.Context(), f.owner))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	input := f.movement(t, a.Summary.ID, command.Review)
	input.SourceBoardID = &board.Board.ID
	input.ExpectedBoardRevision = &board.Board.Revision
	result, err := client.CallTool(ctx, &mcp.CallToolParams{Name: "move_issue", Arguments: input})
	if err != nil || result.IsError {
		t.Fatal("MCP move", err, result)
	}
	encoded, _ := json.Marshal(result.StructuredContent)
	var saved mcpapi.Envelope[command.Saved[command.MoveResult], issues.IssueFailureBody]
	if err := json.Unmarshal(encoded, &saved); err != nil || saved.Data == nil {
		t.Fatal("invalid movement result", err)
	}
	response := callREST(input.IssueID, "move", input.RetryReference, issues.MoveIssueFields{
		ExpectedRevision:            input.ExpectedRevision,
		TargetStatus:                input.TargetStatus,
		ExpectedSourceOrderRevision: input.ExpectedSourceOrderRevision,
		ExpectedTargetOrderRevision: input.ExpectedTargetOrderRevision,
		SourceBoardID:               input.SourceBoardID,
		ExpectedBoardRevision:       input.ExpectedBoardRevision,
	})
	var replay command.Saved[command.MoveResult]
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || *replay.Receipt.EventID != *saved.Data.Receipt.EventID {
		t.Fatal("movement replay diverged", response.Code)
	}
	c := f.issue(t, "C", command.High)
	fresh, err := f.issues.Get(ctx, f.owner, b.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	reorder := issues.ReorderInput{
		IssueID:               b.Summary.ID,
		ExpectedRevision:      fresh.Summary.Revision,
		ExpectedOrderRevision: fresh.SourceOrderRevision,
		NeighborIssueID:       c.Summary.ID,
		Placement:             issues.After,
		RetryReference:        uuid.NewString(),
	}
	result, err = client.CallTool(ctx, &mcp.CallToolParams{Name: "reorder_issue", Arguments: reorder})
	if err != nil || result.IsError {
		t.Fatal("MCP reorder", err)
	}
	response = callREST(reorder.IssueID, "reorder", reorder.RetryReference, issues.ReorderIssueFields{
		ExpectedRevision:      reorder.ExpectedRevision,
		ExpectedOrderRevision: reorder.ExpectedOrderRevision,
		NeighborIssueID:       reorder.NeighborIssueID,
		Placement:             reorder.Placement,
	})
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || replay.Receipt.EventID == nil {
		t.Fatal("reorder replay diverged", response.Code)
	}
	updated, err := f.service.Update(ctx, f.owner, UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             "Renamed",
		SavedFilters:     command.IssueFilter{},
		WipLimits:        Limits{},
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	stale := f.movement(t, a.Summary.ID, command.Done)
	stale.SourceBoardID = &board.Board.ID
	stale.ExpectedBoardRevision = &board.Board.Revision
	result, err = client.CallTool(ctx, &mcp.CallToolParams{Name: "move_issue", Arguments: stale})
	if err != nil || !result.IsError {
		t.Fatal("stale board accepted", err)
	}
	encoded, _ = json.Marshal(result.StructuredContent)
	var failure mcpapi.Envelope[command.Saved[command.MoveResult], issues.IssueFailureBody]
	if err := json.Unmarshal(encoded, &failure); err != nil || failure.Error == nil || failure.Error.Current.Board == nil || failure.Error.Current.Issue != nil || failure.Error.Current.Board.Revision != updated.Body.Result.Revision {
		t.Fatal("stale board failure lost its concrete current record", err)
	}
	if _, err := f.service.Archive(ctx, f.owner, RevisionInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: updated.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	result, err = client.CallTool(ctx, &mcp.CallToolParams{Name: "move_issue", Arguments: input})
	if err != nil || !result.IsError {
		t.Fatal("archived-source replay authorized", err)
	}
}
