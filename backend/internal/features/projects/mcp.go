package projects

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
	if err := registerTool(server, command.ListProjects, "List your accessible projects; archived projects are optional.", false, service.List); err != nil {
		return err
	}
	type getInput struct {
		ProjectID command.ProjectID `json:"projectId"`
	}
	if err := registerTool(server, command.GetProject, "Read an accessible project and your current effective role.", false, func(ctx context.Context, actor command.Actor, input getInput) (ProjectView, error) {
		return service.Get(ctx, actor, input.ProjectID)
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateProject, "Create a company project and its default All Issues Kanban board; Administrator only.", false, func(ctx context.Context, actor command.Actor, input CreateInput) (command.Saved[ProjectView], error) {
		out, err := service.Create(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.UpdateProject, "Replace project name and description at its current revision; company Administrator or authorized project administrator with Configure access.", true, func(ctx context.Context, actor command.Actor, input UpdateInput) (command.Saved[ProjectView], error) {
		out, err := service.Update(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ArchiveProject, "Archive a project while retaining its content, history and memberships; Administrator only.", true, func(ctx context.Context, actor command.Actor, input RevisionInput) (command.Saved[ProjectView], error) {
		out, err := service.Archive(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.RestoreProject, "Restore an archived project and its retained work; Administrator only.", false, func(ctx context.Context, actor command.Actor, input RevisionInput) (command.Saved[ProjectView], error) {
		out, err := service.Restore(ctx, actor, input)
		return out.Body, err
	})
}
