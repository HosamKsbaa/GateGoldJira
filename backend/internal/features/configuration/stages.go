package configuration

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"strconv"
	"strings"
)

func (s *Service) SaveStage(ctx context.Context, actor command.Actor, input SaveStageInput) (command.SaveOutcome[StageSaved], error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.StageID.UUID == uuid.Nil || input.ExpectedRevision < 1 || input.Position < 1 || !input.Category.Valid() || input.Category.Category() != input.Category || command.ValidateText(input.Name, 1, 60) != nil {
		return command.SaveOutcome[StageSaved]{}, validation("stage", "Choose an identifier, base category, positive position and a name of 1–60 characters.")
	}
	if (input.Initial && (!input.AcceptsEntries || input.Retired || input.Category != command.Todo)) || (input.Retired && input.AcceptsEntries) {
		return command.SaveOutcome[StageSaved]{}, validation("stage", "The initial stage must be an open To do stage. Retired stages must be closed.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveWorkflowStage, input.ProjectID, input.RetryReference), input, func(ctx context.Context, m *command.Mutation) error {
		if _, err := readWorkflow(ctx, m, input.ProjectID, input.WorkflowID); err != nil {
			return err
		}
		row, err := m.Queries.ConfigurationStage(ctx, input.StageID.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err == nil && (row.ProjectID != input.ProjectID.UUID || row.WorkflowID != input.WorkflowID.UUID) {
			return unavailable()
		}
		return err
	}, func(ctx context.Context, m *command.Mutation, in SaveStageInput) (command.Change[StageSaved], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[StageSaved]{}, err
		}
		flow, err := editableWorkflow(ctx, m, in.ProjectID, in.WorkflowID)
		if err != nil {
			return command.Change[StageSaved]{}, err
		}
		if flow.Retired {
			return command.Change[StageSaved]{}, validation("workflow", "Retired workflows cannot receive configuration edits.")
		}
		row, err := m.Queries.ConfigurationStage(ctx, in.StageID.UUID)
		created := errors.Is(err, pgx.ErrNoRows)
		before := ""
		if !created {
			if err != nil {
				return command.Change[StageSaved]{}, err
			}
			if row.Category != string(in.Category) {
				return command.Change[StageSaved]{}, validation("category", "Create a new stage to change its category. Existing stage identity is retained.")
			}
			if row.Name == in.Name && row.Position == int64(in.Position) && row.IsInitial == in.Initial && row.AcceptsEntries == in.AcceptsEntries && row.Retired == in.Retired {
				return command.Change[StageSaved]{Result: StageSaved{current, stageView(row)}, HTTPStatus: 200}, nil
			}
			if in.Retired && !row.Retired {
				if row.AcceptsEntries {
					return command.Change[StageSaved]{}, validation("retired", "Close stage intake first, migrate its issues, then retire it.")
				}
				used, err := m.Queries.ConfigurationStageReferenced(ctx, row.ID)
				if err != nil {
					return command.Change[StageSaved]{}, err
				}
				if used {
					return command.Change[StageSaved]{}, validation("retired", "Move remaining issues and remap assignment rules before retiring this stage.")
				}
			}
			before = stageSnapshot(row)
		}
		if in.Initial {
			if err = m.Queries.ConfigurationClearInitial(ctx, in.WorkflowID.UUID); err != nil {
				return command.Change[StageSaved]{}, err
			}
		}
		if created {
			if in.Retired {
				return command.Change[StageSaved]{}, validation("retired", "Create an active stage first.")
			}
			row, err = m.Queries.ConfigurationStageInsert(ctx, dbgen.ConfigurationStageInsertParams{
				ID:             in.StageID.UUID,
				ProjectID:      in.ProjectID.UUID,
				WorkflowID:     in.WorkflowID.UUID,
				Name:           in.Name,
				Category:       string(in.Category),
				LegacyStatus:   string(in.Category) + ":" + in.StageID.String(),
				Position:       int64(in.Position),
				IsInitial:      in.Initial,
				AcceptsEntries: in.AcceptsEntries,
				Retired:        in.Retired,
			})
		} else {
			row, err = m.Queries.ConfigurationStageUpdate(ctx, dbgen.ConfigurationStageUpdateParams{
				ID:             row.ID,
				Name:           in.Name,
				Position:       int64(in.Position),
				IsInitial:      in.Initial,
				AcceptsEntries: in.AcceptsEntries,
				Retired:        in.Retired,
			})
		}
		if err != nil {
			return command.Change[StageSaved]{}, err
		}
		if err = validateFlowSafety(ctx, m, in.ProjectID, in.WorkflowID); err != nil {
			return command.Change[StageSaved]{}, err
		}
		if err = m.Queries.ConfigurationWorkflowAdvance(ctx, in.WorkflowID.UUID); err != nil {
			return command.Change[StageSaved]{}, err
		}
		event, err := configurationEvent(ctx, m, command.SaveWorkflowStage, in.ProjectID, []activity.FieldChange{change("stages."+row.ID.String(), before, stageSnapshot(row))})
		if err != nil {
			return command.Change[StageSaved]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[StageSaved]{Result: StageSaved{next, stageView(row)}, EventID: event, HTTPStatus: 200}, err
	}, validateStageSaved)
}
func stageSnapshot(row dbgen.WorkflowStage) string {
	return row.Name + ";position=" + strconv.FormatInt(row.Position, 10) + ";initial=" + strconv.FormatBool(row.IsInitial) + ";entries=" + strconv.FormatBool(row.AcceptsEntries) + ";retired=" + strconv.FormatBool(row.Retired)
}
func (s *Service) SaveTransition(ctx context.Context, actor command.Actor, input SaveTransitionInput) (command.SaveOutcome[TransitionSaved], error) {
	if input.TransitionID.UUID == uuid.Nil || input.ExpectedRevision < 1 || input.FromStageID.UUID == uuid.Nil || input.ToStageID.UUID == uuid.Nil || input.FromStageID == input.ToStageID {
		return command.SaveOutcome[TransitionSaved]{}, validation("transition", "Choose two different stages in this workflow and the current configuration revision.")
	}
	if input.RequiredPermission.Value != nil && !input.RequiredPermission.Value.Valid() {
		return command.SaveOutcome[TransitionSaved]{}, validation("requiredPermission", "Choose member or project administrator permission.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveWorkflowTransition, input.ProjectID, input.RetryReference), input, func(ctx context.Context, m *command.Mutation) error {
		if _, err := readWorkflow(ctx, m, input.ProjectID, input.WorkflowID); err != nil {
			return err
		}
		row, err := m.Queries.ConfigurationTransition(ctx, input.TransitionID.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err == nil && (row.ProjectID != input.ProjectID.UUID || row.WorkflowID != input.WorkflowID.UUID) {
			return unavailable()
		}
		return err
	}, func(ctx context.Context, m *command.Mutation, in SaveTransitionInput) (command.Change[TransitionSaved], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		flow, err := editableWorkflow(ctx, m, in.ProjectID, in.WorkflowID)
		if err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		if flow.Retired {
			return command.Change[TransitionSaved]{}, validation("workflow", "Retired workflows cannot receive configuration edits.")
		}
		source, err := readStage(ctx, m, in.ProjectID, in.FromStageID)
		if err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		target, err := readStage(ctx, m, in.ProjectID, in.ToStageID)
		if err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		if source.WorkflowID != in.WorkflowID.UUID || target.WorkflowID != in.WorkflowID.UUID {
			return command.Change[TransitionSaved]{}, validation("transition", "Both stages must belong to this workflow.")
		}
		if !in.Retired && (source.Retired || target.Retired) {
			return command.Change[TransitionSaved]{}, validation("transition", "Moves must retain active source and target stages. Intake controls whether issues can enter the target.")
		}
		var role *string
		if in.RequiredPermission.Value != nil {
			v := string(*in.RequiredPermission.Value)
			role = &v
		}
		row, err := m.Queries.ConfigurationTransition(ctx, in.TransitionID.UUID)
		created := errors.Is(err, pgx.ErrNoRows)
		before := ""
		if !created {
			if err != nil {
				return command.Change[TransitionSaved]{}, err
			}
			if row.FromStageID != in.FromStageID.UUID || row.ToStageID != in.ToStageID.UUID {
				return command.Change[TransitionSaved]{}, validation("transition", "Create a new move to change its endpoints; the existing move keeps its identity.")
			}
			sameRole := (row.RequiredPermission == nil && role == nil) || (row.RequiredPermission != nil && role != nil && *row.RequiredPermission == *role)
			if sameRole && row.Retired == in.Retired {
				return command.Change[TransitionSaved]{Result: TransitionSaved{current, transitionView(row)}, HTTPStatus: 200}, nil
			}
			before = transitionSnapshot(row)
			row, err = m.Queries.ConfigurationTransitionUpdate(ctx, dbgen.ConfigurationTransitionUpdateParams{
				ID:                 row.ID,
				RequiredPermission: role,
				Retired:            in.Retired,
			})
		} else {
			row, err = m.Queries.ConfigurationTransitionInsert(ctx, dbgen.ConfigurationTransitionInsertParams{
				ID:                 in.TransitionID.UUID,
				ProjectID:          in.ProjectID.UUID,
				WorkflowID:         in.WorkflowID.UUID,
				FromStageID:        in.FromStageID.UUID,
				ToStageID:          in.ToStageID.UUID,
				RequiredPermission: role,
				Retired:            in.Retired,
			})
		}
		if err != nil {
			return command.Change[TransitionSaved]{}, uniqueError(err)
		}
		if err = validateFlowSafety(ctx, m, in.ProjectID, in.WorkflowID); err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		if err = m.Queries.ConfigurationWorkflowAdvance(ctx, in.WorkflowID.UUID); err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		event, err := configurationEvent(ctx, m, command.SaveWorkflowTransition, in.ProjectID, []activity.FieldChange{change("transitions."+row.ID.String(), before, transitionSnapshot(row))})
		if err != nil {
			return command.Change[TransitionSaved]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[TransitionSaved]{
			Result:     TransitionSaved{next, transitionView(row)},
			EventID:    event,
			HTTPStatus: 200,
		}, err
	}, validateTransitionSaved)
}
func transitionSnapshot(row dbgen.WorkflowTransition) string {
	role := "none"
	if row.RequiredPermission != nil {
		role = *row.RequiredPermission
	}
	return row.FromStageID.String() + "->" + row.ToStageID.String() + ";permission=" + role + ";retired=" + strconv.FormatBool(row.Retired)
}
