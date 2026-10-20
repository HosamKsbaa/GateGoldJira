package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerFieldMCP(server *mcp.Server, s *Service) error {
	if err := canonicalTool(server, command.GetCustomFields, "GetCustomFields: scoped typed values and current rule revisions; historical data retained.", s.GetCustomFields); err != nil {
		return err
	}
	if err := canonicalTool(server, command.SaveCustomFields, "SaveCustomFields: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in SaveCustomFieldsInput) (command.Saved[CustomFieldsView], error) {
		out, err := s.SaveCustomFields(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := canonicalTool(server, command.GetApprovalContext, "GetApprovals: scoped typed values and current rule revisions; historical data retained.", s.GetApprovals); err != nil {
		return err
	}
	if err := canonicalTool(server, command.VoteApproval, "VoteApproval: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in ApprovalVoteInput) (command.Saved[ApprovalContextView], error) {
		out, err := s.VoteApproval(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := canonicalTool(server, command.ResubmitApproval, "ResubmitApproval: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in ApprovalResubmitInput) (command.Saved[ApprovalContextView], error) {
		out, err := s.ResubmitApproval(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return nil
}
