package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func canonicalTool[In, Out any](server *mcp.Server, op command.Operation, description string, run func(context.Context, command.Actor, In) (Out, error)) error {
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
	}, modernFailureBody)
}
func registerCanonicalMCP(server *mcp.Server, s *Service) error {
	if err := registerFieldMCP(server, s); err != nil {
		return err
	}
	if err := canonicalTool(server, command.ListIssueTransitions, "Page through active target stages in the issue's current workflow, including current permission and review requirements.", s.TransitionOptions); err != nil {
		return err
	}
	if err := canonicalTool(server, command.GetModernIssue, "Read canonical issue type, priority, workflow and stage identities with current display names and capabilities.", func(ctx context.Context, a command.Actor, in ModernGetInput) (ModernIssueView, error) {
		return s.GetModern(ctx, a, in.IssueID)
	}); err != nil {
		return err
	}
	if err := canonicalTool(server, command.SearchModernIssues, "Search authorized issues by number/key/title and typed choice identifiers. Live pages preserve exact totals and precision-safe priority ordering.", s.SearchModern); err != nil {
		return err
	}
	if err := canonicalTool(server, command.CreateModernIssue, "Create standard or subtask work with typed choice identifiers. Omitted choices resolve under the project guard; retry preserves the originally accepted defaults.", func(ctx context.Context, a command.Actor, in ModernCreateInput) (command.Saved[ModernIssueView], error) {
		out, err := s.CreateModern(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := canonicalTool(server, command.UpdateModernIssue, "Edit canonical issue fields at the current issue revision. Retain unchanged retired choices and preserve its assigned workflow.", func(ctx context.Context, a command.Actor, in ModernUpdateInput) (command.Saved[ModernIssueView], error) {
		out, err := s.UpdateModern(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := canonicalTool(server, command.PatchModernIssueField, "Save one selected assignee, priority identifier or date by prior-value CAS; unrelated field edits merge and unchanged saves are no-ops.", func(ctx context.Context, a command.Actor, in ModernPatchInput) (command.Saved[ModernIssueView], error) {
		out, err := s.PatchModernField(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return canonicalTool(server, command.MoveModernIssue, "Move within the issue's assigned canonical workflow, enforcing current transition permission, stage intake, blockers and subtask completion.", func(ctx context.Context, a command.Actor, in ModernMoveInput) (command.Saved[ModernIssueView], error) {
		out, err := s.MoveModern(ctx, a, in)
		return out.Body, err
	})
}
