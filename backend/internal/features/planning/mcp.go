package planning

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerTool[In, Out any](server *mcp.Server, op command.Operation, description string, run func(context.Context, command.Actor, In) (Out, error)) error {
	return mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   op,
		Description: description,
		Destructive: op.IsMutation(),
	}, func(ctx context.Context, in In) (Out, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			var zero Out
			return zero, err
		}
		return run(ctx, a, in)
	}, failureBody)
}
func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.ListPlanningItems, "List accessible epics or releases with target dates and progress.", s.List); err != nil {
		return err
	}
	if err := registerTool(server, command.ListPlanningIssues, "Page through issues assigned to a project epic or release.", s.ListIssues); err != nil {
		return err
	}
	if err := registerTool(server, command.GetIssuePlanning, "Read epic and release assignments with their own revision.", s.GetIssue); err != nil {
		return err
	}
	if err := registerTool(server, command.GetKanbanReport, "Read a UTC-window Kanban report from actual status history and a current aging/blocked snapshot.", s.Report); err != nil {
		return err
	}
	if err := registerTool(server, command.CreatePlanningItem, "Create an epic or release in a writable project, with a UUID retry reference.", func(ctx context.Context, a command.Actor, in PlanningCreateInput) (command.Saved[PlanningItemView], error) {
		out, err := s.Create(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.UpdatePlanningItem, "Update planning fields at the current revision; no duplicate side effects on replay.", func(ctx context.Context, a command.Actor, in PlanningUpdateInput) (command.Saved[PlanningItemView], error) {
		out, err := s.Update(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.SetIssuePlanning, "Assign or clear an issue epic and release from the same project at the planning revision.", func(ctx context.Context, a command.Actor, in IssuePlanningInput) (command.Saved[IssuePlanningView], error) {
		out, err := s.SetIssue(ctx, a, in)
		return out.Body, err
	})
}
