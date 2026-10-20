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

func validateTypeSaved(out TypeSaved) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	if out.Type.ID.UUID == uuid.Nil || out.Type.ProjectID != out.Configuration.ProjectID || !out.Type.Behavior.Valid() || (out.Type.Default && out.Type.Retired) {
		return errors.New("invalid type result")
	}
	_, err := normalize(out.Type.Key, out.Type.Name)
	return err
}
func validatePrioritySaved(out PrioritySaved) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	if out.Priority.ID.UUID == uuid.Nil || out.Priority.ProjectID != out.Configuration.ProjectID || out.Priority.SortOrder < 1 || (out.Priority.Default && out.Priority.Retired) {
		return errors.New("invalid priority result")
	}
	_, err := normalize(out.Priority.Key, out.Priority.Name)
	return err
}
func requireModernDefaults(current ConfigurationView) error {
	if current.Mode != Modern {
		return validation("defaults", "Enable modern issue access before changing creation defaults. Existing clients must not silently use different fixed defaults.")
	}
	return nil
}

func (s *Service) SaveType(ctx context.Context, actor command.Actor, input SaveTypeInput) (command.SaveOutcome[TypeSaved], error) {
	name, err := normalize(input.Key, input.Name)
	if err != nil {
		return command.SaveOutcome[TypeSaved]{}, err
	}
	input.Name = name
	if input.TypeID.UUID == uuid.Nil || input.ExpectedRevision < 1 || !input.Behavior.Valid() {
		return command.SaveOutcome[TypeSaved]{}, validation("type", "Use a type identifier, current configuration revision and checked behavior.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveIssueType, input.ProjectID, input.RetryReference), input,
		func(ctx context.Context, m *command.Mutation) error {
			row, err := m.Queries.ConfigurationType(ctx, input.TypeID.UUID)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			if row.ProjectID != input.ProjectID.UUID {
				return unavailable()
			}
			return nil
		}, func(ctx context.Context, m *command.Mutation, in SaveTypeInput) (command.Change[TypeSaved], error) {
			current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
			if err != nil {
				return command.Change[TypeSaved]{}, err
			}
			existing, err := m.Queries.ConfigurationType(ctx, in.TypeID.UUID)
			created := errors.Is(err, pgx.ErrNoRows)
			if err != nil && !created {
				return command.Change[TypeSaved]{}, err
			}
			changes := []activity.FieldChange{}
			var row dbgen.IssueType
			if created {
				if in.Retired || in.ReplacementDefaultID != nil {
					return command.Change[TypeSaved]{}, validation("retired", "Create an active type before retiring it.")
				}
				template := current.Defaults.StandardTypeID
				if in.Behavior == Subtask {
					template = current.Defaults.SubtaskTypeID
				}
				_, flow, err := eligibleType(ctx, m, in.ProjectID, template, in.Behavior)
				if err != nil {
					return command.Change[TypeSaved]{}, err
				}
				row, err = m.Queries.ConfigurationTypeInsert(ctx, dbgen.ConfigurationTypeInsertParams{
					ID:        in.TypeID.UUID,
					ProjectID: in.ProjectID.UUID,
					Key:       in.Key,
					Name:      in.Name,
					Behavior:  string(in.Behavior),
				})
				if err != nil {
					return command.Change[TypeSaved]{}, uniqueError(err)
				}
				if err = m.Queries.ConfigurationBindType(ctx, dbgen.ConfigurationBindTypeParams{
					ProjectID:  in.ProjectID.UUID,
					TypeID:     row.ID,
					WorkflowID: flow,
				}); err != nil {
					return command.Change[TypeSaved]{}, err
				}
				changes = append(changes, change("issueType.created", "", in.TypeID.String()+":"+in.Key))
			} else {
				if existing.Key != in.Key {
					return command.Change[TypeSaved]{}, validation("key", "The type's stable key cannot be renamed; change its display name instead.")
				}
				if existing.Behavior != string(in.Behavior) {
					used, err := m.Queries.ConfigurationTypeUse(ctx, in.TypeID.UUID)
					if err != nil {
						return command.Change[TypeSaved]{}, err
					}
					if used || existing.IsDefault {
						return command.Change[TypeSaved]{}, validation("behavior", "Used or default types keep their behavior. Create a separate type for another behavior.")
					}
					changes = append(changes, change("issueType.behavior", existing.Behavior, string(in.Behavior)))
				}
				if existing.IsDefault && in.Retired {
					if err = requireModernDefaults(current); err != nil {
						return command.Change[TypeSaved]{}, err
					}
					if in.ReplacementDefaultID == nil || *in.ReplacementDefaultID == in.TypeID {
						return command.Change[TypeSaved]{}, validation("replacementDefaultId", "Choose another active default with the same behavior before retiring this one.")
					}
					if err = replaceTypeDefault(ctx, m, in.ProjectID, *in.ReplacementDefaultID, in.Behavior); err != nil {
						return command.Change[TypeSaved]{}, err
					}
					changes = append(changes, change("issueType.default", in.TypeID.String(), in.ReplacementDefaultID.String()))
				} else if in.ReplacementDefaultID != nil {
					return command.Change[TypeSaved]{}, validation("replacementDefaultId", "A replacement is only used when retiring the current default.")
				}
				if existing.Name != in.Name {
					changes = append(changes, change("issueType.name", existing.Name, in.Name))
				}
				if existing.Retired != in.Retired {
					changes = append(changes, change("issueType.retired", strconv.FormatBool(existing.Retired), strconv.FormatBool(in.Retired)))
				}
				if len(changes) == 0 {
					return command.Change[TypeSaved]{Result: TypeSaved{current, typeView(existing)}, HTTPStatus: 200}, nil
				}
				row, err = m.Queries.ConfigurationTypeUpdate(ctx, dbgen.ConfigurationTypeUpdateParams{
					ID:       in.TypeID.UUID,
					Name:     in.Name,
					Behavior: string(in.Behavior),
					Retired:  in.Retired,
				})
				if err != nil {
					return command.Change[TypeSaved]{}, err
				}
			}
			event, err := configurationEvent(ctx, m, command.SaveIssueType, in.ProjectID, changes)
			if err != nil {
				return command.Change[TypeSaved]{}, err
			}
			next, err := readView(ctx, m, in.ProjectID)
			status := 200
			if created {
				status = 201
			}
			return command.Change[TypeSaved]{Result: TypeSaved{next, typeView(row)}, EventID: event, HTTPStatus: status}, err
		}, validateTypeSaved)
}

func (s *Service) SavePriority(ctx context.Context, actor command.Actor, input SavePriorityInput) (command.SaveOutcome[PrioritySaved], error) {
	name, err := normalize(input.Key, input.Name)
	if err != nil {
		return command.SaveOutcome[PrioritySaved]{}, err
	}
	input.Name = name
	if input.PriorityID.UUID == uuid.Nil || input.ExpectedRevision < 1 || input.SortOrder < 1 {
		return command.SaveOutcome[PrioritySaved]{}, validation("priority", "Use a priority identifier, current revision and positive sort order.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SavePriority, input.ProjectID, input.RetryReference), input,
		func(ctx context.Context, m *command.Mutation) error {
			row, err := m.Queries.ConfigurationPriority(ctx, input.PriorityID.UUID)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			if row.ProjectID != input.ProjectID.UUID {
				return unavailable()
			}
			return nil
		}, func(ctx context.Context, m *command.Mutation, in SavePriorityInput) (command.Change[PrioritySaved], error) {
			current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
			if err != nil {
				return command.Change[PrioritySaved]{}, err
			}
			existing, err := m.Queries.ConfigurationPriority(ctx, in.PriorityID.UUID)
			created := errors.Is(err, pgx.ErrNoRows)
			if err != nil && !created {
				return command.Change[PrioritySaved]{}, err
			}
			var row dbgen.Priority
			changes := []activity.FieldChange{}
			if created {
				if in.Retired || in.ReplacementDefaultID != nil {
					return command.Change[PrioritySaved]{}, validation("retired", "Create an active priority before retiring it.")
				}
				row, err = m.Queries.ConfigurationPriorityInsert(ctx, dbgen.ConfigurationPriorityInsertParams{
					ID:        in.PriorityID.UUID,
					ProjectID: in.ProjectID.UUID,
					Key:       in.Key,
					Name:      in.Name,
					SortOrder: int64(in.SortOrder),
				})
				if err != nil {
					return command.Change[PrioritySaved]{}, uniqueError(err)
				}
				changes = append(changes, change("priority.created", "", in.PriorityID.String()+":"+in.Key))
			} else {
				if existing.Key != in.Key {
					return command.Change[PrioritySaved]{}, validation("key", "The priority's stable key cannot be renamed; change its display name instead.")
				}
				if existing.IsDefault && in.Retired {
					if err = requireModernDefaults(current); err != nil {
						return command.Change[PrioritySaved]{}, err
					}
					if in.ReplacementDefaultID == nil || *in.ReplacementDefaultID == in.PriorityID {
						return command.Change[PrioritySaved]{}, validation("replacementDefaultId", "Choose another active default before retiring this one.")
					}
					if err = replacePriorityDefault(ctx, m, in.ProjectID, *in.ReplacementDefaultID); err != nil {
						return command.Change[PrioritySaved]{}, err
					}
					changes = append(changes, change("priority.default", in.PriorityID.String(), in.ReplacementDefaultID.String()))
				} else if in.ReplacementDefaultID != nil {
					return command.Change[PrioritySaved]{}, validation("replacementDefaultId", "A replacement is only used when retiring the current default.")
				}
				if existing.Name != in.Name {
					changes = append(changes, change("priority.name", existing.Name, in.Name))
				}
				if existing.SortOrder != int64(in.SortOrder) {
					changes = append(changes, change("priority.sortOrder", strconv.FormatInt(existing.SortOrder, 10), strconv.FormatInt(int64(in.SortOrder), 10)))
				}
				if existing.Retired != in.Retired {
					changes = append(changes, change("priority.retired", strconv.FormatBool(existing.Retired), strconv.FormatBool(in.Retired)))
				}
				if len(changes) == 0 {
					return command.Change[PrioritySaved]{Result: PrioritySaved{current, priorityView(existing)}, HTTPStatus: 200}, nil
				}
				row, err = m.Queries.ConfigurationPriorityUpdate(ctx, dbgen.ConfigurationPriorityUpdateParams{
					ID:        in.PriorityID.UUID,
					Name:      in.Name,
					SortOrder: int64(in.SortOrder),
					Retired:   in.Retired,
				})
				if err != nil {
					return command.Change[PrioritySaved]{}, err
				}
			}
			event, err := configurationEvent(ctx, m, command.SavePriority, in.ProjectID, changes)
			if err != nil {
				return command.Change[PrioritySaved]{}, err
			}
			next, err := readView(ctx, m, in.ProjectID)
			status := 200
			if created {
				status = 201
			}
			return command.Change[PrioritySaved]{
				Result:     PrioritySaved{next, priorityView(row)},
				EventID:    event,
				HTTPStatus: status,
			}, err
		}, validatePrioritySaved)
}
func (s *Service) SetDefaults(ctx context.Context, actor command.Actor, input SetDefaultsInput) (command.SaveOutcome[ConfigurationView], error) {
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[ConfigurationView]{}, validation("expectedRevision", "Read the current configuration revision before saving.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SetProjectDefaults, input.ProjectID, input.RetryReference), input, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in SetDefaultsInput) (command.Change[ConfigurationView], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		if in.Defaults == current.Defaults {
			return command.Change[ConfigurationView]{Result: current, HTTPStatus: 200}, nil
		}
		if err = requireModernDefaults(current); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		// Validate all replacements before clearing any uniqueness-protected default.
		if _, _, err = eligibleType(ctx, m, in.ProjectID, in.Defaults.StandardTypeID, Standard); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		if _, _, err = eligibleType(ctx, m, in.ProjectID, in.Defaults.SubtaskTypeID, Subtask); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		if _, err = eligiblePriority(ctx, m, in.ProjectID, in.Defaults.PriorityID); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		changes := []activity.FieldChange{}
		if current.Defaults.StandardTypeID != in.Defaults.StandardTypeID {
			if err = replaceTypeDefault(ctx, m, in.ProjectID, in.Defaults.StandardTypeID, Standard); err != nil {
				return command.Change[ConfigurationView]{}, err
			}
			changes = append(changes, change("default.standardType", current.Defaults.StandardTypeID.String(), in.Defaults.StandardTypeID.String()))
		}
		if current.Defaults.SubtaskTypeID != in.Defaults.SubtaskTypeID {
			if err = replaceTypeDefault(ctx, m, in.ProjectID, in.Defaults.SubtaskTypeID, Subtask); err != nil {
				return command.Change[ConfigurationView]{}, err
			}
			changes = append(changes, change("default.subtaskType", current.Defaults.SubtaskTypeID.String(), in.Defaults.SubtaskTypeID.String()))
		}
		if current.Defaults.PriorityID != in.Defaults.PriorityID {
			if err = replacePriorityDefault(ctx, m, in.ProjectID, in.Defaults.PriorityID); err != nil {
				return command.Change[ConfigurationView]{}, err
			}
			changes = append(changes, change("default.priority", current.Defaults.PriorityID.String(), in.Defaults.PriorityID.String()))
		}
		event, err := configurationEvent(ctx, m, command.SetProjectDefaults, in.ProjectID, changes)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[ConfigurationView]{Result: next, EventID: event, HTTPStatus: 200}, err
	}, validateView)
}
