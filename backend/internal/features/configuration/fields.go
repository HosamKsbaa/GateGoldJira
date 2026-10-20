package configuration

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"strings"
)

func fieldView(row dbgen.ConfigurationFieldRow) (FieldView, error) {
	value, err := command.ReadFieldSlots(command.ValueKind(row.ValueKind), command.FieldSlots{
		Text:     row.DefaultText,
		Number:   command.NumberSlot(row.DefaultNumberText),
		Date:     row.DefaultDate,
		OptionID: row.DefaultOptionID,
		UserID:   row.DefaultUserID,
	})
	return FieldView{
		ID:           command.FieldID{UUID: row.ID},
		ProjectID:    command.ProjectID{UUID: row.ProjectID},
		Key:          row.Key,
		Name:         row.Name,
		Kind:         command.ValueKind(row.ValueKind),
		Required:     row.Required,
		Retired:      row.Retired,
		DefaultValue: value,
	}, err
}
func optionView(row dbgen.FieldOption) FieldOptionView {
	return FieldOptionView{
		ID:        command.FieldOptionID{UUID: row.ID},
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		FieldID:   command.FieldID{UUID: row.FieldID},
		Name:      row.Name,
		Position:  command.Position(row.Position),
		Retired:   row.Retired,
	}
}
func fieldJSON(value *command.FieldValue) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
func validateFieldView(v FieldView) error {
	if v.ID.UUID == uuid.Nil || v.ProjectID.UUID == uuid.Nil || !v.Kind.Valid() || command.ValidateText(v.Name, 1, 60) != nil {
		return errors.New("invalid field result")
	}
	if v.DefaultValue != nil {
		return v.DefaultValue.Validate()
	}
	return nil
}
func (s *Service) SaveField(ctx context.Context, actor command.Actor, in SaveFieldInput) (command.SaveOutcome[FieldSaved], error) {
	empty := command.SaveOutcome[FieldSaved]{}
	name, err := normalize(in.Key, in.Name)
	if err != nil {
		return empty, err
	}
	in.Name = name
	if in.FieldID.UUID == uuid.Nil || in.ExpectedRevision < 1 || !in.Kind.Valid() || in.Retired && in.Required {
		return empty, validation("field", "Supply a valid field kind and revision. Deactivate global requirements before retirement.")
	}
	if in.DefaultValue != nil {
		if err = in.DefaultValue.Validate(); err != nil {
			return empty, validation("defaultValue", err.Error())
		}
		if in.Required && in.Kind == command.TextValue && in.DefaultValue.Kind == command.TextValue && strings.TrimSpace(*in.DefaultValue.Text) == "" {
			return empty, validation("defaultValue", "A required text default must contain content.")
		}
		if in.DefaultValue.Kind != in.Kind {
			return empty, validation("defaultValue", "The default must use this field's value kind.")
		}
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveField, in.ProjectID, in.RetryReference), in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in SaveFieldInput) (command.Change[FieldSaved], error) {
		empty := command.Change[FieldSaved]{}
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return empty, err
		}
		old, err := m.Queries.ConfigurationField(ctx, dbgen.ConfigurationFieldParams{
			ProjectID: in.ProjectID.UUID,
			ID:        in.FieldID.UUID,
		})
		exists := err == nil
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return empty, err
		}
		prior := FieldView{}
		if exists {
			prior, err = fieldView(old)
			if err != nil {
				return empty, err
			}
			if prior.Key != in.Key {
				return empty, validation("key", "A field's stable key cannot change.")
			}
		}
		next := FieldView{
			ID:           in.FieldID,
			ProjectID:    in.ProjectID,
			Key:          in.Key,
			Name:         in.Name,
			Kind:         in.Kind,
			Required:     in.Required,
			Retired:      in.Retired,
			DefaultValue: in.DefaultValue,
		}
		before, _ := json.Marshal(prior)
		after, _ := json.Marshal(next)
		if exists && string(before) == string(after) {
			return command.Change[FieldSaved]{Result: FieldSaved{current, prior}, HTTPStatus: 200}, nil
		}
		if in.Required && current.Mode != Modern {
			return empty, validation("required", "Prepare optional fields until the project uses the native issue client.")
		}
		if exists && prior.Kind != in.Kind {
			used, err := m.Queries.ConfigurationFieldUsed(ctx, in.FieldID.UUID)
			if err != nil {
				return empty, err
			}
			if used {
				return empty, validation("kind", "A field used by values, options or transition rules keeps its value kind.")
			}
		}
		if in.Retired {
			required, err := m.Queries.ConfigurationFieldRequiredByTransition(ctx, dbgen.ConfigurationFieldRequiredByTransitionParams{
				ProjectID: in.ProjectID.UUID,
				FieldID:   &in.FieldID.UUID,
			})
			if err != nil {
				return empty, err
			}
			if required {
				return empty, validation("retired", "Remove active transition requirements before retiring this field.")
			}
		}
		if in.Required {
			missing, err := m.Queries.ConfigurationFieldHasMissing(ctx, dbgen.ConfigurationFieldHasMissingParams{
				ProjectID: in.ProjectID.UUID,
				FieldID:   in.FieldID.UUID,
			})
			if err != nil {
				return empty, err
			}
			if missing {
				return empty, validation("required", "Prepare the field, backfill existing issues, then enable its global requirement.")
			}
		}
		if in.DefaultValue != nil && fieldJSON(prior.DefaultValue) != fieldJSON(in.DefaultValue) {
			if in.DefaultValue.OptionID != nil {
				option, err := m.Queries.ConfigurationFieldOption(ctx, dbgen.ConfigurationFieldOptionParams{
					ProjectID: in.ProjectID.UUID,
					FieldID:   in.FieldID.UUID,
					ID:        in.DefaultValue.OptionID.UUID,
				})
				if err != nil || option.Retired {
					return empty, validation("defaultValue", "Choose an active option in this field.")
				}
			}
			if in.DefaultValue.UserID != nil {
				eligible, err := m.Queries.ConfigurationFieldUserEligible(ctx, dbgen.ConfigurationFieldUserEligibleParams{
					ProjectID: in.ProjectID.UUID,
					ID:        in.DefaultValue.UserID.UUID,
				})
				if err != nil {
					return empty, err
				}
				if !eligible {
					return empty, validation("defaultValue", "Choose an active project member or administrator.")
				}
			}
		}
		slots := in.DefaultValue.Slots()
		if _, err = m.Queries.ConfigurationSaveField(ctx, dbgen.ConfigurationSaveFieldParams{
			ID:              in.FieldID.UUID,
			ProjectID:       in.ProjectID.UUID,
			Key:             in.Key,
			Name:            in.Name,
			ValueKind:       string(in.Kind),
			Required:        in.Required,
			Retired:         in.Retired,
			DefaultText:     slots.Text,
			DefaultNumber:   slots.Number,
			DefaultDate:     slots.Date,
			DefaultOptionID: slots.OptionID,
			DefaultUserID:   slots.UserID,
		}); err != nil {
			return empty, fieldWriteError(err)
		}
		event, err := configurationEvent(ctx, m, command.SaveField, in.ProjectID, []activity.FieldChange{change("fields."+in.FieldID.String(), string(before), string(after))})
		if err != nil {
			return empty, err
		}
		view, err := readView(ctx, m, in.ProjectID)
		status := 200
		if !exists {
			status = 201
		}
		return command.Change[FieldSaved]{Result: FieldSaved{view, next}, EventID: event, HTTPStatus: status}, err
	}, func(v FieldSaved) error {
		if err := validateView(v.Configuration); err != nil {
			return err
		}
		return validateFieldView(v.Field)
	})
}
func (s *Service) SaveFieldOption(ctx context.Context, actor command.Actor, in SaveFieldOptionInput) (command.SaveOutcome[FieldOptionSaved], error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.FieldID.UUID == uuid.Nil || in.OptionID.UUID == uuid.Nil || in.ExpectedRevision < 1 || in.Position < 1 || command.ValidateText(in.Name, 1, 60) != nil {
		return command.SaveOutcome[FieldOptionSaved]{}, validation("option", "Supply a current revision, positive position, scoped IDs and option name.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveFieldOption, in.ProjectID, in.RetryReference), in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in SaveFieldOptionInput) (command.Change[FieldOptionSaved], error) {
		empty := command.Change[FieldOptionSaved]{}
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return empty, err
		}
		field, err := m.Queries.ConfigurationField(ctx, dbgen.ConfigurationFieldParams{
			ProjectID: in.ProjectID.UUID,
			ID:        in.FieldID.UUID,
		})
		if err != nil {
			return empty, unavailable()
		}
		if field.ValueKind != "choice" || field.Retired {
			return empty, validation("fieldId", "Edit options on an active choice field.")
		}
		old, err := m.Queries.ConfigurationFieldOption(ctx, dbgen.ConfigurationFieldOptionParams{
			ProjectID: in.ProjectID.UUID,
			FieldID:   in.FieldID.UUID,
			ID:        in.OptionID.UUID,
		})
		exists := err == nil
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return empty, err
		}
		if exists && old.Name == in.Name && old.Position == int64(in.Position) && old.Retired == in.Retired {
			return command.Change[FieldOptionSaved]{Result: FieldOptionSaved{current, optionView(old)}, HTTPStatus: 200}, nil
		}
		if in.Retired && field.DefaultOptionID != nil && *field.DefaultOptionID == in.OptionID.UUID {
			return empty, validation("retired", "Replace or clear the field's default option before retiring it.")
		}
		if _, err = m.Queries.ConfigurationSaveFieldOption(ctx, dbgen.ConfigurationSaveFieldOptionParams{
			ID:        in.OptionID.UUID,
			ProjectID: in.ProjectID.UUID,
			FieldID:   in.FieldID.UUID,
			Name:      in.Name,
			Position:  int64(in.Position),
			Retired:   in.Retired,
		}); err != nil {
			return empty, fieldWriteError(err)
		}
		next := FieldOptionView{
			ID:        in.OptionID,
			ProjectID: in.ProjectID,
			FieldID:   in.FieldID,
			Name:      in.Name,
			Position:  in.Position,
			Retired:   in.Retired,
		}
		before, _ := json.Marshal(optionView(old))
		after, _ := json.Marshal(next)
		event, err := configurationEvent(ctx, m, command.SaveFieldOption, in.ProjectID, []activity.FieldChange{change("fieldOptions."+in.OptionID.String(), string(before), string(after))})
		if err != nil {
			return empty, err
		}
		root, err := readView(ctx, m, in.ProjectID)
		status := 200
		if !exists {
			status = 201
		}
		return command.Change[FieldOptionSaved]{Result: FieldOptionSaved{root, next}, EventID: event, HTTPStatus: status}, err
	}, func(v FieldOptionSaved) error { return validateView(v.Configuration) })
}

func fieldWriteError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return unavailable()
	}
	return uniqueError(err)
}

type FieldBackfiller func(context.Context, *command.Mutation, command.ProjectID, command.FieldID, int) (int32, int64, *string, error)

func (s *Service) WithFieldBackfiller(backfill FieldBackfiller) *Service {
	s.fieldBackfiller = backfill
	return s
}
func (s *Service) BackfillField(ctx context.Context, actor command.Actor, in BackfillFieldInput) (command.SaveOutcome[BackfillFieldResult], error) {
	if in.ExpectedRevision < 1 || in.FieldID.UUID == uuid.Nil || in.Limit < 1 || in.Limit > 100 {
		return command.SaveOutcome[BackfillFieldResult]{}, validation("limit", "Supply current configuration and a batch of 1-100 issues.")
	}
	return command.Save(ctx, s.runner, request(actor, command.BackfillFieldDefaults, in.ProjectID, in.RetryReference), in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in BackfillFieldInput) (command.Change[BackfillFieldResult], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[BackfillFieldResult]{}, err
		}
		if current.Mode != Modern {
			return command.Change[BackfillFieldResult]{}, validation("field", "Backfill requires the native issue model.")
		}
		if s.fieldBackfiller == nil {
			return command.Change[BackfillFieldResult]{}, validation("field", "Field backfill is not configured.")
		}
		changed, remaining, event, err := s.fieldBackfiller(ctx, m, in.ProjectID, in.FieldID, in.Limit)
		return command.Change[BackfillFieldResult]{
			Result:     BackfillFieldResult{current, changed, remaining},
			EventID:    event,
			HTTPStatus: 200,
		}, err
	}, func(v BackfillFieldResult) error { return validateView(v.Configuration) })
}
