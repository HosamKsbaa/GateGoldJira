package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/jackc/pgx/v5"
)

func requireModernProject(ctx context.Context, m *command.Mutation, project command.ProjectID) error {
	if permissions, err := m.ProjectPermissions(project); err == nil {
		if !permissions.ModernCore {
			_, err := m.Tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", project.UUID)
			return err
		}
		return nil
	}
	row, err := m.Queries.ReadProject(ctx, project.UUID)
	if err != nil {
		return err
	}
	if row.CoreMode != "modern" {
		_, err := m.Tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", project.UUID)
		return err
	}
	return nil
}
func canonicalType(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueTypeID) (dbgen.IssueType, error) {
	row, err := m.Queries.IssuesCanonicalType(ctx, dbgen.IssuesCanonicalTypeParams{ProjectID: project.UUID, ID: id.UUID})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, unavailableIssue()
	}
	return row, err
}
func canonicalPriority(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.PriorityID) (dbgen.Priority, error) {
	row, err := m.Queries.IssuesCanonicalPriority(ctx, dbgen.IssuesCanonicalPriorityParams{ProjectID: project.UUID, ID: id.UUID})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, unavailableIssue()
	}
	return row, err
}
func canonicalStage(ctx context.Context, m *command.Mutation, project command.ProjectID, flow command.WorkflowID, id command.StageID) (dbgen.WorkflowStage, error) {
	row, err := m.Queries.IssuesCanonicalStage(ctx, dbgen.IssuesCanonicalStageParams{
		ProjectID:  project.UUID,
		WorkflowID: flow.UUID,
		ID:         id.UUID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, unavailableIssue()
	}
	return row, err
}

// Only retained database projections use these values. Modern results always
// return the actual identity, key, name and behavior; V1 edits are gated before
// modern-mode activation. Compatibility DTOs derive them from canonical choices.
func legacyTypeProjection(kind dbgen.IssueType) command.IssueType {
	if kind.Behavior == "subtask" {
		return command.Subtask
	}
	if kind.Key == "bug" {
		return command.Bug
	}
	return command.Task
}
func legacyPriorityProjection(priority dbgen.Priority) command.Priority {
	switch priority.Key {
	case "low":
		return command.Low
	case "high":
		return command.High
	default:
		return command.Medium
	}
}

type creationChoices struct {
	kind     dbgen.IssueType
	priority dbgen.Priority
	workflow dbgen.Workflow
	stage    dbgen.WorkflowStage
}

func resolveCreationChoices(ctx context.Context, m *command.Mutation, project command.ProjectID, input ModernCreateFields) (creationChoices, error) {
	var out creationChoices
	var err error
	if err = requireModernProject(ctx, m, project); err != nil {
		return out, err
	}
	behavior := "standard"
	if input.ParentID != nil {
		behavior = "subtask"
	}
	if input.TypeID == nil {
		out.kind, err = m.Queries.IssuesCanonicalDefaultType(ctx, dbgen.IssuesCanonicalDefaultTypeParams{ProjectID: project.UUID, Behavior: behavior})
	} else {
		out.kind, err = canonicalType(ctx, m, project, *input.TypeID)
	}
	if err != nil {
		return out, err
	}
	if out.kind.Retired || out.kind.Behavior != behavior {
		return out, validation("typeId", "Choose an active type matching standard or subtask behavior.")
	}
	if input.PriorityID == nil {
		out.priority, err = m.Queries.IssuesCanonicalDefaultPriority(ctx, project.UUID)
	} else {
		out.priority, err = canonicalPriority(ctx, m, project, *input.PriorityID)
	}
	if err != nil {
		return out, err
	}
	if out.priority.Retired {
		return out, validation("priorityId", "Choose an active priority.")
	}
	if input.WorkflowID == nil {
		out.workflow, err = m.Queries.IssuesCanonicalDefaultWorkflow(ctx, dbgen.IssuesCanonicalDefaultWorkflowParams{
			ProjectID: project.UUID,
			TypeID:    out.kind.ID,
		})
	} else {
		out.workflow, err = m.Queries.IssuesCanonicalWorkflow(ctx, dbgen.IssuesCanonicalWorkflowParams{
			ProjectID: project.UUID,
			ID:        input.WorkflowID.UUID,
		})
	}
	if err != nil {
		return out, err
	}
	if out.workflow.Retired {
		return out, validation("workflowId", "Choose an active workflow.")
	}
	binding, err := m.Queries.IssuesCanonicalBinding(ctx, dbgen.IssuesCanonicalBindingParams{
		ProjectID:  project.UUID,
		TypeID:     out.kind.ID,
		WorkflowID: out.workflow.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !binding.AcceptsNew) {
		return out, validation("workflowId", "The selected type/workflow binding must accept new issues.")
	}
	if err != nil {
		return out, err
	}
	out.stage, err = m.Queries.IssuesCanonicalInitial(ctx, dbgen.IssuesCanonicalInitialParams{
		ProjectID:  project.UUID,
		WorkflowID: out.workflow.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return out, validation("workflowId", "This workflow needs an open initial stage.")
	}
	if err != nil {
		return out, err
	}
	if out.stage.Category != "todo" || (input.StageID != nil && input.StageID.UUID != out.stage.ID) {
		return out, validation("stageId", "Create in the initial To do stage, then use an allowed move to progress the issue.")
	}
	return out, nil
}
