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
)

func (s *Service) SetBinding(ctx context.Context, actor command.Actor, input SetBindingInput) (command.SaveOutcome[ConfigurationView], error) {
	if input.TypeID.UUID == uuid.Nil || input.WorkflowID.UUID == uuid.Nil || input.ExpectedRevision < 1 || (input.Default && !input.AcceptsNew) {
		return command.SaveOutcome[ConfigurationView]{}, validation("binding", "A default binding must accept new issues. Supply the current configuration revision.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SetTypeWorkflowBinding, input.ProjectID, input.RetryReference), input, func(ctx context.Context, m *command.Mutation) error {
		if _, err := readType(ctx, m, input.ProjectID, input.TypeID); err != nil {
			return err
		}
		_, err := readWorkflow(ctx, m, input.ProjectID, input.WorkflowID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in SetBindingInput) (command.Change[ConfigurationView], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		old, err := m.Queries.ConfigurationBinding(ctx, dbgen.ConfigurationBindingParams{
			ProjectID:  in.ProjectID.UUID,
			TypeID:     in.TypeID.UUID,
			WorkflowID: in.WorkflowID.UUID,
		})
		exists := err == nil
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return command.Change[ConfigurationView]{}, err
		}
		if exists && old.IsDefault == in.Default && old.AcceptsNew == in.AcceptsNew {
			return command.Change[ConfigurationView]{Result: current, HTTPStatus: 200}, nil
		}
		if err = requireModernDefaults(current); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		kind, err := readType(ctx, m, in.ProjectID, in.TypeID)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		flow, err := readWorkflow(ctx, m, in.ProjectID, in.WorkflowID)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		if in.AcceptsNew && (kind.Retired || flow.Retired) {
			return command.Change[ConfigurationView]{}, validation("acceptsNew", "Only active types and workflows can accept new issues.")
		}
		if exists && old.IsDefault && !in.Default {
			return command.Change[ConfigurationView]{}, validation("default", "Make an eligible replacement binding the default before closing this binding.")
		}
		if in.Default {
			if err = m.Queries.ConfigurationClearBindingDefault(ctx, dbgen.ConfigurationClearBindingDefaultParams{
				ProjectID: in.ProjectID.UUID,
				TypeID:    in.TypeID.UUID,
			}); err != nil {
				return command.Change[ConfigurationView]{}, err
			}
		}
		if err = m.Queries.ConfigurationSaveBinding(ctx, dbgen.ConfigurationSaveBindingParams{
			ProjectID:  in.ProjectID.UUID,
			TypeID:     in.TypeID.UUID,
			WorkflowID: in.WorkflowID.UUID,
			IsDefault:  in.Default,
			AcceptsNew: in.AcceptsNew,
		}); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		if err = validateFlowSafety(ctx, m, in.ProjectID, in.WorkflowID); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		// The replaced workflow retains its references and transitions. Only future
		// creation uses this default; changing a default never migrates old issues.
		before := ""
		if exists {
			before = "default=" + strconv.FormatBool(old.IsDefault) + ";intake=" + strconv.FormatBool(old.AcceptsNew)
		}
		event, err := configurationEvent(ctx, m, command.SetTypeWorkflowBinding, in.ProjectID, []activity.FieldChange{change("bindings."+in.TypeID.String()+"."+in.WorkflowID.String(), before, "default="+strconv.FormatBool(in.Default)+";intake="+strconv.FormatBool(in.AcceptsNew))})
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[ConfigurationView]{Result: next, EventID: event, HTTPStatus: 200}, err
	}, validateView)
}
