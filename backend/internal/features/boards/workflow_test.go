package boards

import (
	"context"
	"encoding/json"
	"errors"
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

func deliveryFlow() command.BoardWorkflow {
	flow := defaultWorkflow()
	flow.Columns[0].Name = "جاهز"
	flow.Columns[0].AllowedTargets = []command.Status{command.InProgress}
	flow.Columns[1].Name = "Building"
	flow.Columns[1].AllowedTargets = []command.Status{command.Review}
	flow.Columns[2].Name = "Quality review"
	flow.Columns[2].AllowedTargets = []command.Status{command.InProgress, command.Done}
	flow.Columns[3].AllowedTargets = []command.Status{command.InProgress}
	flow.Columns[1], flow.Columns[2] = flow.Columns[2], flow.Columns[1]
	return flow
}
func TestWorkflowRejectsLostStagesAndTrappedWork(t *testing.T) {
	cases := []struct {
		name   string
		change func(*command.BoardWorkflow)
	}{
		{"lost stage", func(w *command.BoardWorkflow) { w.Columns = w.Columns[:3] }},
		{"duplicate status", func(w *command.BoardWorkflow) { w.Columns[1].Status = command.Todo }},
		{"duplicate name", func(w *command.BoardWorkflow) { w.Columns[1].Name = " to DO " }},
		{"self target", func(w *command.BoardWorkflow) { w.Columns[0].AllowedTargets = []command.Status{command.Todo} }},
		{"unknown target", func(w *command.BoardWorkflow) { w.Columns[0].AllowedTargets = []command.Status{"qa"} }},
		{"trapped cycle", func(w *command.BoardWorkflow) {
			w.Columns[0].AllowedTargets = []command.Status{command.InProgress}
			w.Columns[1].AllowedTargets = []command.Status{command.Todo}
		}},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			flow := defaultWorkflow()
			tt.change(&flow)
			if _, err := normalizeWorkflow(flow); err == nil {
				t.Fatal("invalid workflow accepted")
			}
		})
	}
	if _, err := normalizeWorkflow(deliveryFlow()); err != nil {
		t.Fatal("valid sequential delivery flow rejected", err)
	}
}
func TestBoardFlowPersistsWithPermissionsRevisionAndMoveRules(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Delivery", command.IssueFilter{})
	work := f.issue(t, "Work", command.Medium)
	flow := deliveryFlow()
	input := UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             board.Board.Name,
		SavedFilters:     board.Board.SavedFilters,
		WipLimits:        board.Board.WipLimits,
		Workflow:         &flow,
		RetryReference:   uuid.NewString(),
	}
	for _, actor := range []command.Actor{f.other, f.viewer} {
		if _, err := f.service.Update(ctx, actor, input); err == nil {
			t.Fatal("non-manager changed flow")
		}
	}
	saved, err := f.service.Update(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	view, err := f.service.Get(ctx, f.viewer, GetInput{BoardID: board.Board.ID})
	if err != nil || view.Columns[1].Status != command.Review || boardWorkflow(view.Board).Columns[0].Name != "جاهز" {
		t.Fatal("flow order or Arabic name lost", err)
	}
	move := f.movement(t, work.Summary.ID, command.Review)
	move.SourceBoardID = &board.Board.ID
	move.ExpectedBoardRevision = &saved.Body.Result.Revision
	if _, err := f.issues.Move(ctx, f.member, move); err == nil {
		t.Fatal("disallowed shortcut succeeded")
	}
	unchanged, _ := f.issues.Get(ctx, f.member, work.Summary.ID)
	if unchanged.Summary.Revision != work.Summary.Revision {
		t.Fatal("rejected move changed issue")
	}
	move = f.movement(t, work.Summary.ID, command.InProgress)
	move.SourceBoardID = &board.Board.ID
	move.ExpectedBoardRevision = &saved.Body.Result.Revision
	moved, err := f.issues.Move(ctx, f.member, move)
	if err != nil {
		t.Fatal("allowed move failed", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.issues.Move(ctx, actor, move)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Issue.Summary.Revision != moved.Body.Result.Issue.Summary.Revision {
		t.Fatal("move replay changed work", err)
	}
	input.Workflow = nil
	input.ExpectedRevision = saved.Body.Result.Revision
	input.Name = "Delivery renamed"
	input.RetryReference = uuid.NewString()
	renamed, err := f.service.Update(ctx, f.member, input)
	if err != nil || boardWorkflow(renamed.Body.Result).Columns[0].Name != "جاهز" {
		t.Fatal("legacy settings update discarded workflow", err)
	}
	stale := input
	stale.RetryReference = uuid.NewString()
	stale.Workflow = &flow
	var conflict *command.BoardConflict
	if _, err := f.service.Update(ctx, f.member, stale); !errors.As(err, &conflict) {
		t.Fatal("stale editor overwrote board")
	}
	defaultBoard, err := f.service.List(ctx, f.owner, ListInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range defaultBoard.Items {
		if row.Default {
			flow = deliveryFlow()
			_, err = f.service.Update(ctx, f.owner, UpdateInput{
				BoardID:          row.ID,
				ExpectedRevision: row.Revision,
				Name:             row.Name,
				SavedFilters:     row.SavedFilters,
				WipLimits:        row.WipLimits,
				Workflow:         &flow,
				RetryReference:   uuid.NewString(),
			})
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	direct := f.issue(t, "API move", command.Medium)
	if _, err := f.issues.Move(ctx, f.member, f.movement(t, direct.Summary.ID, command.Done)); err == nil {
		t.Fatal("boardless move bypassed default rules")
	}
}
func TestWorkflowSettingsMCPRESTCanonicalReplay(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Typed workflow", command.IssueFilter{})
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	actor := f.member
	actor.Channel = command.MCP
	left, right := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(auth.WithActor(ctx, actor), left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "workflow", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	flow := deliveryFlow()
	custom := command.Status("review:" + uuid.NewString())
	flow.Columns = append(flow.Columns, command.WorkflowColumn{
		Status:         custom,
		Name:           "QA via MCP",
		AllowedTargets: []command.Status{command.Done},
	})
	flow.Columns[0].AllowedTargets = append(flow.Columns[0].AllowedTargets, custom)
	ref := uuid.NewString()
	input := UpdateInput{
		BoardID:          board.Board.ID,
		ExpectedRevision: board.Board.Revision,
		Name:             board.Board.Name,
		SavedFilters:     board.Board.SavedFilters,
		WipLimits:        board.Board.WipLimits,
		Workflow:         &flow,
		RetryReference:   ref,
	}
	result, err := client.CallTool(ctx, &mcp.CallToolParams{Name: "update_board", Arguments: input})
	if err != nil || result.IsError {
		t.Fatal("MCP workflow update rejected", err)
	}
	body, _ := json.Marshal(UpdateBoardFields{
		ExpectedRevision: input.ExpectedRevision,
		Name:             input.Name,
		SavedFilters:     input.SavedFilters,
		WipLimits:        input.WipLimits,
		Workflow:         &flow,
	})
	request := httptest.NewRequest("PUT", "/api/v1/boards/"+board.Board.ID.String(), strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", ref)
	request = request.WithContext(auth.WithActor(ctx, f.member))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	var saved command.Saved[BoardSummary]
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &saved) != nil || !saved.Receipt.Replayed || boardWorkflow(saved.Result).Columns[1].Status != command.Review {
		t.Fatal("typed workflow replay failed", response.Code)
	}
}
