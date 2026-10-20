package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerWorkflowMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.ListWorkflows, "Page through project workflows, retaining retired workflow identities for existing issues.", s.Workflows); err != nil {
		return err
	}
	if err := registerTool(server, command.ListWorkflowStages, "Page through ordered workflow stages and their entry/retirement state.", s.Stages); err != nil {
		return err
	}
	if err := registerTool(server, command.ListWorkflowTransitions, "Page through explicit directed workflow moves and required project permission.", s.Transitions); err != nil {
		return err
	}
	if err := registerTool(server, command.ListTypeWorkflowBindings, "Read retained allowed/default workflows for one project issue type.", s.Bindings); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveWorkflow, "Create, rename or retire a workflow at the current project configuration revision. Replacing defaults does not migrate existing work.", func(ctx context.Context, a command.Actor, in SaveWorkflowInput) (command.Saved[WorkflowSaved], error) {
		out, err := s.SaveWorkflow(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveWorkflowStage, "Edit one workflow stage. Close intake, migrate issues, then retire the empty stage; preserve completion paths and default-board coverage.", func(ctx context.Context, a command.Actor, in SaveStageInput) (command.Saved[StageSaved], error) {
		out, err := s.SaveStage(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveWorkflowTransition, "Edit a directed move between stages in one workflow while retaining required completion paths.", func(ctx context.Context, a command.Actor, in SaveTransitionInput) (command.Saved[TransitionSaved], error) {
		out, err := s.SaveTransition(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SetTypeWorkflowBinding, "Set a type/workflow binding and its creation default/intake. Existing issues keep their binding; modern issue access is required for changes.", func(ctx context.Context, a command.Actor, in SetBindingInput) (command.Saved[ConfigurationView], error) {
		out, err := s.SetBinding(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.MigrateWorkflowIssues, "Atomically migrate a batch of up to 100 issues from a closed stage to a same-category stage in an allowed workflow. Preserve issue history, notices and retry identity.", func(ctx context.Context, a command.Actor, in MigrationInput) (command.Saved[MigrationResult], error) {
		out, err := s.Migrate(ctx, a, in)
		return out.Body, err
	})
}
