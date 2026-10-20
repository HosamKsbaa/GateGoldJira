package mcpapi

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Activity deliberately excludes arguments, response bodies, credentials and headers.
type ActivityCompletion struct {
	Outcome     string
	ErrorCode   *string
	ResourceURL *string
	DurationMS  int64
}

type ActivityRecorder interface {
	StartMCPActivity(context.Context, command.Actor, command.Operation) (uuid.UUID, error)
	FinishMCPActivity(context.Context, uuid.UUID, ActivityCompletion) error
}

type activityRecorderKey struct{}
type activityCallKey struct{}
type activityCall struct {
	errorCode   *string
	resourceURL *string
}

func activityFailure(ctx context.Context, err error) {
	if call, ok := ctx.Value(activityCallKey{}).(*activityCall); ok {
		code := string(httpapi.Error(err).FailureBody.Error.Code)
		call.errorCode = &code
	}
}

func activityLinks(ctx context.Context, links []ResourceLink) {
	if call, ok := ctx.Value(activityCallKey{}).(*activityCall); ok && len(links) > 0 {
		call.resourceURL = &links[0].URL
	}
}

// This wraps only a registered tool, before schema validation. The operation name
// comes from server registration, never from untrusted arguments or unknown tools.
func recordActivity(ctx context.Context, operation command.Operation, run func(context.Context) (mcp.Result, error)) (mcp.Result, error) {
	actor, _ := auth.Actor(ctx)
	recorder, _ := ctx.Value(activityRecorderKey{}).(ActivityRecorder)
	if actor.MCPTokenID == uuid.Nil {
		return run(ctx)
	}
	if recorder == nil {
		return nil, errors.New("MCP activity recording is unavailable")
	}
	startCtx, cancel := command.OrdinaryContext(ctx)
	id, err := recorder.StartMCPActivity(startCtx, actor, operation)
	cancel()
	if err != nil {
		// Fail closed: no tool runs unless its attempt has been durably recorded.
		return nil, errors.New("MCP activity could not be recorded; retry the request")
	}
	started := time.Now()
	call := &activityCall{}
	result, runErr := run(context.WithValue(ctx, activityCallKey{}, call))
	outcome := "succeeded"
	toolResult, _ := result.(*mcp.CallToolResult)
	if runErr != nil || toolResult != nil && toolResult.IsError {
		outcome = "failed"
		if call.errorCode == nil {
			code := "protocol_error"
			call.errorCode = &code
		}
	}
	finishCtx, finishCancel := command.OrdinaryContext(context.WithoutCancel(ctx))
	defer finishCancel()
	err = recorder.FinishMCPActivity(finishCtx, id, ActivityCompletion{
		Outcome: outcome, ErrorCode: call.errorCode, ResourceURL: call.resourceURL, DurationMS: time.Since(started).Milliseconds(),
	})
	if err != nil {
		// The persisted started row remains visibly unconfirmed. Never misreport a
		// committed business change as failed because completion logging failed.
		slog.ErrorContext(finishCtx, "MCP activity completion unavailable", "activity_id", id)
	}
	return result, runErr
}
