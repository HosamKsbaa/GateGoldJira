package identity

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
	if err := registerTool(server, command.ListMembershipCandidates, "List minimal approved company directory names for membership management in your authorized project.", false, service.ListMembershipCandidates); err != nil {
		return err
	}
	if err := registerTool(server, command.GetMe, "Read your own approved company identity and calendar.", false, func(ctx context.Context, actor command.Actor, _ struct{}) (Me, error) {
		return service.GetMe(ctx, actor)
	}); err != nil {
		return err
	}
	type usersInput struct {
		Page command.PageRequest `json:"page,omitempty"`
	}
	if err := registerTool(server, command.ListUsers, "List approved company accounts; Administrator only.", false, func(ctx context.Context, actor command.Actor, input usersInput) (command.Page[UserView], error) {
		return service.ListUsers(ctx, actor, input.Page)
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ApproveUser, "Approve a company account; Administrator only.", false, func(ctx context.Context, actor command.Actor, input ApproveInput) (command.Saved[UserView], error) {
		out, err := service.ApproveUser(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.UpdateUser, "Replace current editable account fields; Administrator only.", true, func(ctx context.Context, actor command.Actor, input UpdateUserInput) (command.Saved[UserView], error) {
		out, err := service.UpdateUser(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ListMemberships, "List project memberships; company Administrator or authorized project administrator with Configure access.", false, func(ctx context.Context, actor command.Actor, input MembershipListInput) (command.Page[MembershipView], error) {
		return service.ListMemberships(ctx, actor, input)
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SetMembership, "Grant or replace a project role using its retained revision.", true, func(ctx context.Context, actor command.Actor, input SetMembershipInput) (command.Saved[MembershipView], error) {
		out, err := service.SetMembership(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.RemoveMembership, "Remove current project membership and clear ineligible assignments.", true, func(ctx context.Context, actor command.Actor, input RemoveMembershipInput) (command.Saved[MembershipView], error) {
		out, err := service.RemoveMembership(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ListAssignees, "List minimal eligible project assignee summaries.", false, func(ctx context.Context, actor command.Actor, input CandidateInput) (command.Page[UserSummary], error) {
		return service.ListAssignees(ctx, actor, input)
	}); err != nil {
		return err
	}
	return registerTool(server, command.ListMentionCandidates, "List minimal eligible project reader summaries for selected mentions.", false, func(ctx context.Context, actor command.Actor, input CandidateInput) (command.Page[UserSummary], error) {
		return service.ListMentionCandidates(ctx, actor, input)
	})
}
