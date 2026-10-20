package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerOrganizationMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.OrganizeIssue, "Archive/restore or plan an issue in the backlog with its current revision. Archive hides active work without deleting history or changing completion.", true, func(ctx context.Context, a command.Actor, in OrganizeInput) (command.Saved[IssueView], error) {
		out, err := s.Organize(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SetIssueWatch, "Watch or unwatch an accessible issue for the authenticated caller. Subscription state is private.", false, func(ctx context.Context, a command.Actor, in WatchInput) (command.Saved[WatchView], error) {
		out, err := s.SetWatch(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SetIssueLink, "Add or remove a retained same-project relates-to or duplicates link. Use the current issue revision.", true, func(ctx context.Context, a command.Actor, in LinkInput) (command.Saved[IssueView], error) {
		out, err := s.SetLink(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ListSavedSearches, "List the caller's private saved searches (maximum 50).", false, func(ctx context.Context, a command.Actor, _ struct{}) (SavedSearchList, error) {
		return s.SavedSearches(ctx, a)
	}); err != nil {
		return err
	}
	return registerTool(server, command.SaveIssueSearch, "Create, replace or remove a private saved search. Use expectedRevision 0 only for a new caller-generated UUID; maximum 50 active searches.", true, func(ctx context.Context, a command.Actor, in SaveSearchInput) (command.Saved[SavedSearch], error) {
		out, err := s.SaveSearch(ctx, a, in)
		return out.Body, err
	})
}
