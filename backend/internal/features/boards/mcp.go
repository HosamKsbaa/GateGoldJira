package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerTool[In, Out any](server *mcp.Server, operation command.Operation, description string, destructive bool, run func(context.Context, command.Actor, In) (Out, error)) error {
	return mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   operation,
		Description: description,
		Destructive: destructive,
	}, func(ctx context.Context, input In) (Out, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			var zero Out
			return zero, err
		}
		return run(ctx, actor, input)
	}, failureBody)
}

func RegisterMCP(server *mcp.Server, service *Service) error {
	if err := registerNativeMCP(server, service); err != nil {
		return err
	}
	if err := registerTool(server, command.ListBoards, "List a project's named and default boards with current management capabilities.", false, service.List); err != nil {
		return err
	}
	if err := registerTool(server, command.GetBoard, "Read four column counts. Temporary filters narrow visible counts; saved WIP counts remain complete.", false, service.Get); err != nil {
		return err
	}
	if err := registerTool(server, command.ListBoardCards, "Read one bounded column page in shared project order; reload after an invalidated cursor.", false, service.Cards); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateBoard, "Create a named view in an active project without copying or changing issues.", false, func(ctx context.Context, a command.Actor, in CreateInput) (command.Saved[BoardSummary], error) {
		out, err := service.Create(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.UpdateBoard, "Replace current board settings with a fresh revision. WIP limits warn without blocking valid moves.", true, func(ctx context.Context, a command.Actor, in UpdateInput) (command.Saved[BoardSummary], error) {
		out, err := service.Update(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ArchiveBoard, "Archive a named view while preserving its issues and settings; the default board cannot archive.", true, func(ctx context.Context, a command.Actor, in RevisionInput) (command.Saved[BoardSummary], error) {
		out, err := service.Archive(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.RestoreBoard, "Restore a named view with its retained settings.", false, func(ctx context.Context, a command.Actor, in RevisionInput) (command.Saved[BoardSummary], error) {
		out, err := service.Restore(ctx, a, in)
		return out.Body, err
	})
}
