package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerImportExportHTTP(api huma.API, s *Service) {
	registerRead(api, issueOperation(api, command.PreviewIssueImport, "POST", "/projects/{projectId}/issues/import-preview"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		Body      ImportPreviewFields
	}) (ImportPreview, error) {
		return s.PreviewImport(ctx, a, ImportPreviewInput{in.ProjectID, in.Body})
	})
	registerSave(api, issueOperation(api, command.ImportIssues, "POST", "/projects/{projectId}/issues/import"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      ImportFields
	}) (command.SaveOutcome[ImportResult], error) {
		return s.Import(ctx, a, ImportInput{in.ProjectID, in.Body, in.RetryReference})
	})
	registerRead(api, issueOperation(api, command.ExportIssues, "POST", "/projects/{projectId}/issues/export"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		Body      ExportFields
	}) (IssueExport, error) {
		return s.Export(ctx, a, ExportInput{in.ProjectID, in.Body})
	})
}
func registerImportExportMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.PreviewIssueImport, "Validate and preview up to100 mapped CSV rows without writing issues. Names/emails/IDs must match a unique eligible assignee; labels use semicolons.", false, s.PreviewImport); err != nil {
		return err
	}
	if err := registerTool(server, command.ExportIssues, "Export one authorized filtered project page as UTF-8 CSV with formula-safe cells. Continue using nextCursor; reduce limit for oversized descriptions.", false, s.Export); err != nil {
		return err
	}
	return registerTool(server, command.ImportIssues, "Import valid CSV rows after preview. Retain batchId and retryReference on retries; stable source keys deduplicate across batches. Per-row errors preserve successful rows.", false, func(ctx context.Context, a command.Actor, in ImportInput) (command.Saved[ImportResult], error) {
		out, err := s.Import(ctx, a, in)
		return out.Body, err
	})
}
