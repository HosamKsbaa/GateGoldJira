package issues

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
)

// Only a revision-checked configuration transaction calls this collaborator.
// Existing issue movement retains its own history, notices and order revisions;
// completion/reopen migrations must instead use ordinary issue transitions.
func (s *Service) MigrateWorkflowStage(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueID, target command.StageMigrationTarget) error {
	if err := m.RequireProjectWrite(project); err != nil {
		return err
	}
	row, err := m.Queries.ReadIssue(ctx, id.UUID)
	if err != nil {
		return err
	}
	if row.WorkflowID == nil || row.StageID == nil {
		return validation("workflow", "Finish canonical configuration backfill before migrating issues.")
	}
	current, sourceStatus, err := readModernViewWithStatus(ctx, m, id)
	if err != nil {
		return err
	}
	if current.Summary.ProjectID != project || sourceStatus.Category() != target.Status.Category() {
		return validation("targetStageId", "Migration must preserve project and completion category.")
	}
	if err = m.Queries.IssuesRegisterMigrationStage(ctx, dbgen.IssuesRegisterMigrationStageParams{
		ProjectID: project.UUID,
		Status:    string(target.Status),
		StageName: target.Name,
	}); err != nil {
		return err
	}
	oldFlow, newFlow, oldStage, newStage := row.WorkflowID.String(), target.WorkflowID.String(), row.StageID.String(), target.StageID.String()
	changes := []activity.FieldChange{
		{Field: "workflowId", Before: &oldFlow, After: &newFlow},
		{Field: "stageId", Before: &oldStage, After: &newStage},
	}
	_, err = s.applyCanonicalMove(ctx, m, current, sourceStatus, target, changes)
	return err
}
