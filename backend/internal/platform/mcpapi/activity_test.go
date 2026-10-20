package mcpapi

import (
	"context"
	"errors"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type failingActivityRecorder struct {
	startFailure bool
	finished     bool
}

func (recorder *failingActivityRecorder) StartMCPActivity(context.Context, command.Actor, command.Operation) (uuid.UUID, error) {
	if recorder.startFailure {
		return uuid.Nil, errors.New("private database diagnostics")
	}
	return uuid.New(), nil
}
func (recorder *failingActivityRecorder) FinishMCPActivity(ctx context.Context, _ uuid.UUID, completion ActivityCompletion) error {
	recorder.finished = ctx.Err() == nil && completion.Outcome == "succeeded"
	return errors.New("private database diagnostics")
}

func TestActivityFailsClosedBeforeExecutionAndPreservesCommittedResult(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	actor := command.Actor{MCPTokenID: uuid.New(), Channel: command.MCP}
	ctx = auth.WithActor(ctx, actor)
	recorder := &failingActivityRecorder{startFailure: true}
	ctx = context.WithValue(ctx, activityRecorderKey{}, ActivityRecorder(recorder))
	called := false
	_, err := recordActivity(ctx, command.CreateProject, func(context.Context) (mcp.Result, error) {
		called = true
		return &mcp.CallToolResult{}, nil
	})
	if err == nil || called || err.Error() != "MCP activity could not be recorded; retry the request" {
		t.Fatal("an unrecorded operation ran, or private diagnostics escaped")
	}
	recorder.startFailure = false
	result := &mcp.CallToolResult{}
	got, err := recordActivity(ctx, command.CreateProject, func(context.Context) (mcp.Result, error) {
		cancel()
		return result, nil
	})
	if err != nil || got != result || !recorder.finished {
		t.Fatal("completion failure changed the committed result, or cancellation lost completion")
	}
}
