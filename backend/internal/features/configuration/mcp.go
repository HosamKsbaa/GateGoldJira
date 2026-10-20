package configuration

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
	if err := registerTool(server, command.GetProjectActivation, "Review current project readiness and revisions before administrator activation of canonical issue access.", s.ActivationReadiness); err != nil {
		return err
	}
	if err := registerTool(server, command.ActivateProjectCore, "Activate canonical issue access only after confirmed current readiness. Project administrator required; retained data, old receipts and independent board ranks remain unchanged.", func(ctx context.Context, a command.Actor, in ActivateInput) (command.Saved[ConfigurationView], error) {
		out, err := s.Activate(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerFieldMCP(server, s); err != nil {
		return err
	}
	if err := registerWorkflowMCP(server, s); err != nil {
		return err
	}
	if err := registerTool(server, command.GetProjectConfiguration, "Read project-scoped configuration, capabilities and current creation defaults.", s.Get); err != nil {
		return err
	}
	if err := registerTool(server, command.ListIssueTypes, "List active or retained project issue types with checked behavior.", s.Types); err != nil {
		return err
	}
	if err := registerTool(server, command.ListPriorities, "List project priorities with precise positive ordering and retirement state.", s.Priorities); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveIssueType, "Create, rename or retire a project type at the current configuration revision. Project administrator required.", func(ctx context.Context, a command.Actor, in SaveTypeInput) (command.Saved[TypeSaved], error) {
		out, err := s.SaveType(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SavePriority, "Create, rename, order or retire a project priority at the current configuration revision. Project administrator required.", func(ctx context.Context, a command.Actor, in SavePriorityInput) (command.Saved[PrioritySaved], error) {
		out, err := s.SavePriority(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.SetProjectDefaults, "Atomically replace active creation defaults for modern issue clients; existing work retains its references.", func(ctx context.Context, a command.Actor, in SetDefaultsInput) (command.Saved[ConfigurationView], error) {
		out, err := s.SetDefaults(ctx, a, in)
		return out.Body, err
	})
}
