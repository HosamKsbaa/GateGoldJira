package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerBacklogHTTP(api huma.API, s *Service) {
	registerRead(api, issueOperation(api, command.ListBacklog, "GET", "/projects/{projectId}/backlog"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		PageQuery
	}) (BacklogPage, error) {
		return s.Backlog(ctx, a, BacklogInput{in.ProjectID, in.page()})
	})
	registerSave(api, issueOperation(api, command.ReorderBacklog, "POST", "/issues/{issueId}/backlog-order"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    BacklogReorderFields
	}) (command.SaveOutcome[BacklogChange], error) {
		return s.ReorderBacklog(ctx, a, BacklogReorderInput{in.IssueID, in.Body, in.RetryReference})
	})
}
func registerBacklogMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.ListBacklog, "Read planned work in independent project backlog rank order. Ordering cursors expire when planning order changes.", false, s.Backlog); err != nil {
		return err
	}
	return registerTool(server, command.ReorderBacklog, "Rank planned work before or after another backlog item using current issue and backlog order revisions. Active column order is unchanged.", false, func(ctx context.Context, a command.Actor, in BacklogReorderInput) (command.Saved[BacklogChange], error) {
		out, err := s.ReorderBacklog(ctx, a, in)
		return out.Body, err
	})
}
