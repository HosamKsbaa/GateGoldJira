package comments

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.ListComments,
		Description: "Read the issue's paginated oldest-first discussion with canonical HTML, plain text and protected picture IDs.",
	}, func(ctx context.Context, in ListInput) (command.Page[CommentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[CommentView]{}, err
		}
		return s.List(ctx, a, in)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.ListCommentVersions,
		Description: "Read retained immutable comment versions, oldest first. Picture IDs require authenticated downloads.",
	}, func(ctx context.Context, in ListVersionsInput) (command.Page[VersionView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[VersionView]{}, err
		}
		return s.Versions(ctx, a, in)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.CreateComment,
		Description: "Add an Arabic or mixed-language formatted comment, explicit selected mentions and at most five same-issue pictures. Unsupported HTML is sanitized with notices; completed drafts publish atomically. Retry the same intention with its original reference.",
	}, func(ctx context.Context, in CreateInput) (command.Saved[CommentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[CommentView]{}, err
		}
		out, err := s.Create(ctx, a, in)
		return out.Body, err
	}, failureBody); err != nil {
		return err
	}
	return mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.UpdateComment,
		Description: "Edit your own comment with its current revision and current project write access. Old versions and references are retained; newly added mentions require current access.",
	}, func(ctx context.Context, in UpdateInput) (command.Saved[CommentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[CommentView]{}, err
		}
		out, err := s.Update(ctx, a, in)
		return out.Body, err
	}, failureBody)
}
