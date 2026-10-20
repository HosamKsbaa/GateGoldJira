package integrations

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerTool[In, Out any](server *mcp.Server, op command.Operation, description string, run func(context.Context, command.Actor, In) (Out, error)) error {
	return mcpapi.Register(server, mcpapi.ToolOptions{
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
	})
}
func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.ListDevelopmentLinks, "List manually linked pull requests, commits and other development URLs for an accessible issue.", s.ListLinks); err != nil {
		return err
	}
	if err := registerTool(server, command.ListAutomationRules, "List a project's stage-entry assignment rules, including disabled rules.", s.ListRules); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveDevelopmentLink, "Create, edit or detach a validated development URL at the current revision using a stable link UUID and retry reference.", func(ctx context.Context, a command.Actor, in DevelopmentLinkInput) (command.Saved[DevelopmentLinkView], error) {
		out, err := s.SaveLink(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.SaveAutomationRule, "Administrator only: create or edit a rule assigning work when it enters a registered stage. At most one enabled rule per stage.", func(ctx context.Context, a command.Actor, in AutomationRuleInput) (command.Saved[AutomationRuleView], error) {
		out, err := s.SaveRule(ctx, a, in)
		return out.Body, err
	})
}
