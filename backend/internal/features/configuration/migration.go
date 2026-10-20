package configuration

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"strconv"
)

func validateMigration(out MigrationResult) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	if out.Moved < 0 || out.Moved > 100 || out.Remaining < 0 {
		return errors.New("invalid migration result")
	}
	return nil
}
func (s *Service) Migrate(ctx context.Context, actor command.Actor, input MigrationInput) (command.SaveOutcome[MigrationResult], error) {
	if input.SourceStageID.UUID == uuid.Nil || input.TargetStageID.UUID == uuid.Nil || input.SourceStageID == input.TargetStageID || input.ExpectedRevision < 1 || input.Limit < 1 || input.Limit > 100 {
		return command.SaveOutcome[MigrationResult]{}, validation("migration", "Choose different stages, the current configuration revision and a batch of 1–100 issues.")
	}
	return command.Save(ctx, s.runner, request(actor, command.MigrateWorkflowIssues, input.ProjectID, input.RetryReference), input, func(ctx context.Context, m *command.Mutation) error {
		if _, err := readStage(ctx, m, input.ProjectID, input.SourceStageID); err != nil {
			return err
		}
		_, err := readStage(ctx, m, input.ProjectID, input.TargetStageID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in MigrationInput) (command.Change[MigrationResult], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		if err = requireModernDefaults(current); err != nil {
			return command.Change[MigrationResult]{}, err
		}
		source, err := readStage(ctx, m, in.ProjectID, in.SourceStageID)
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		target, err := readStage(ctx, m, in.ProjectID, in.TargetStageID)
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		if source.AcceptsEntries {
			return command.Change[MigrationResult]{}, validation("sourceStageId", "Close source intake before starting the migration.")
		}
		if source.Category != target.Category {
			return command.Change[MigrationResult]{}, validation("targetStageId", "Choose the same completion category. Complete or reopen work using normal issue transitions first.")
		}
		flow, err := readWorkflow(ctx, m, in.ProjectID, command.WorkflowID{UUID: target.WorkflowID})
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		if target.Retired || !target.AcceptsEntries || flow.Retired {
			return command.Change[MigrationResult]{}, validation("targetStageId", "Choose an open stage in an active workflow.")
		}
		compatible, err := m.Queries.ConfigurationMigrationTypeCompatibility(ctx, dbgen.ConfigurationMigrationTypeCompatibilityParams{
			ProjectID:  in.ProjectID.UUID,
			StageID:    &source.ID,
			WorkflowID: target.WorkflowID,
		})
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		if !compatible {
			return command.Change[MigrationResult]{}, validation("targetStageId", "Allow the target workflow for every type currently in the source stage before migrating.")
		}
		if err = checkFlowSafety(ctx, m, in.ProjectID, command.WorkflowID{UUID: target.WorkflowID}, true); err != nil {
			return command.Change[MigrationResult]{}, err
		}
		rows, err := m.Queries.ConfigurationMigrationIssues(ctx, dbgen.ConfigurationMigrationIssuesParams{
			ProjectID: in.ProjectID.UUID,
			StageID:   &source.ID,
			PageSize:  int32(in.Limit),
		})
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		if len(rows) == 0 {
			return command.Change[MigrationResult]{Result: MigrationResult{Configuration: current}, HTTPStatus: 200}, nil
		}
		if s.stageMigrator == nil {
			return command.Change[MigrationResult]{}, errors.New("issue stage migration is unavailable")
		}
		for _, id := range rows {
			if err = s.stageMigrator(ctx, m, in.ProjectID, command.IssueID{UUID: id}, command.StageMigrationTarget{
				WorkflowID: command.WorkflowID{UUID: target.WorkflowID},
				StageID:    in.TargetStageID,
				Status:     command.Status(target.LegacyStatus),
				Name:       target.Name,
			}); err != nil {
				return command.Change[MigrationResult]{}, err
			}
		}
		remaining, err := m.Queries.ConfigurationMigrationRemaining(ctx, dbgen.ConfigurationMigrationRemainingParams{
			ProjectID: in.ProjectID.UUID,
			StageID:   &source.ID,
		})
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		event, err := configurationEvent(ctx, m, command.MigrateWorkflowIssues, in.ProjectID, []activity.FieldChange{change("stageMigration", source.ID.String(), target.ID.String()+";moved="+strconv.Itoa(len(rows)))})
		if err != nil {
			return command.Change[MigrationResult]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[MigrationResult]{
			Result: MigrationResult{
				Configuration: next,
				Moved:         len(rows),
				Remaining:     remaining,
			},
			EventID:    event,
			HTTPStatus: 200,
		}, err
	}, validateMigration)
}
