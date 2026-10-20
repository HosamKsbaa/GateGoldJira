package issues

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
	if err := registerCanonicalMCP(server, service); err != nil {
		return err
	}
	if err := registerTool(server, command.PatchIssueField, "Change only assignee, priority or due date using that field's prior value. Unrelated edits are preserved; stale selected values conflict. Explicit null clears assignee/date; unchanged values do not create a change event.", true, func(ctx context.Context, actor command.Actor, in PatchFieldInput) (command.Saved[IssueView], error) {
		out, err := service.PatchField(ctx, actor, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerBacklogMCP(server, service); err != nil {
		return err
	}
	if err := registerImportExportMCP(server, service); err != nil {
		return err
	}
	if err := registerOrganizationMCP(server, service); err != nil {
		return err
	}
	if err := registerTool(server, command.ListSubtasks, "Read one-level child work in issue-number order, with independent fields and bounded portions.", false, service.Subtasks); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateSubtask, "Create independent child work under a current non-Done Task or Bug. Parent identity and Subtask type stay fixed; completion remains explicit and guarded.", false, func(ctx context.Context, a command.Actor, in CreateSubtaskInput) (command.Saved[IssueView], error) {
		out, err := service.CreateSubtask(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ListLabels, "Find reusable labels in an accessible project, with bounded portions and Unicode casefold search.", false, service.Labels); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateLabel, "Create or reuse a project label. Names differing only in Unicode letter case retain the existing identity and display text.", false, func(ctx context.Context, a command.Actor, in CreateLabelInput) (command.Saved[LabelView], error) {
		out, err := service.CreateLabel(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ListDependencies, "Read Blocked By or Blocks with responsible developers, statuses and bounded reciprocal summaries. Reload after a graph cursor changes.", false, service.Dependencies); err != nil {
		return err
	}
	if err := registerTool(server, command.AddDependency, "Add a same-project blocker using current issue/graph revisions. Duplicate links are no-ops; cycles include parent/subtask edges.", true, func(ctx context.Context, a command.Actor, in AddDependencyInput) (command.Saved[DependencyView], error) {
		out, err := service.AddDependency(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.RemoveDependency, "Remove a blocker with fresh issue, graph and relationship revisions. Retain the relationship and activity history.", true, func(ctx context.Context, a command.Actor, in RemoveDependencyInput) (command.Saved[DependencyView], error) {
		out, err := service.RemoveDependency(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.MoveIssue, "Move using fresh issue, source/target order and optional board revisions. Done requires completed blockers and children. WIP warns only; append in the target column.", true, func(ctx context.Context, a command.Actor, in MoveInput) (command.Saved[command.MoveResult], error) {
		out, err := service.Move(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.ReorderIssue, "Move before or after one actual same-column neighbor, preserving hidden cards and shared project order.", true, func(ctx context.Context, a command.Actor, in ReorderInput) (command.Saved[command.MoveResult], error) {
		out, err := service.Reorder(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SearchIssues, "Search accessible issues with AND filters and bounded pages; use assignee kind self for My Issues.", false, service.Search); err != nil {
		return err
	}
	type getInput struct {
		IssueID command.IssueID `json:"issueId"`
	}
	if err := registerTool(server, command.GetIssue, "Read an accessible issue, current capabilities and graph/order revisions.", false, func(ctx context.Context, actor command.Actor, input getInput) (IssueView, error) {
		return service.Get(ctx, actor, input.IssueID)
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateIssue, "Create a Task or Bug in an active project; defaults are Todo, Task and Medium. Attribution is the current caller.", false, func(ctx context.Context, actor command.Actor, input CreateInput) (command.Saved[IssueView], error) {
		out, err := service.Create(ctx, actor, input)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.UpdateIssue, "Replace every editable field from a fresh issue read and revision. Use null to clear assignment/date; status, reporter and parent remain immutable.", true, func(ctx context.Context, actor command.Actor, input UpdateInput) (command.Saved[IssueView], error) {
		out, err := service.Update(ctx, actor, input)
		return out.Body, err
	})
}
