package issues

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"sort"
	"strings"
)

type CustomFieldsInput struct {
	IssueID command.IssueID     `json:"issueId"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type SaveCustomFieldsInput struct {
	IssueID          command.IssueID           `json:"issueId"`
	ExpectedRevision command.Revision          `json:"expectedRevision"`
	Values           []command.FieldAssignment `json:"values" nullable:"false" minItems:"1" maxItems:"100"`
	RetryReference   string                    `json:"retryReference" format:"uuid"`
}
type FieldValueDisplay struct {
	FieldID     command.FieldID `json:"fieldId"`
	ReferenceID uuid.UUID       `json:"referenceId" format:"uuid"`
	Label       string          `json:"label" minLength:"1" maxLength:"200"`
	Retired     bool            `json:"retired"`
}
type CustomFieldsView struct {
	IssueID       command.IssueID           `json:"issueId"`
	Revision      command.Revision          `json:"revision"`
	Definitions   []command.FieldDefinition `json:"definitions" nullable:"false" maxItems:"100"`
	Values        []command.FieldAssignment `json:"values" nullable:"false" maxItems:"100"`
	DisplayValues []FieldValueDisplay       `json:"displayValues,omitempty" nullable:"false" maxItems:"100"`
	NextCursor    *string                   `json:"nextCursor" nullable:"true"`
}
type customFieldsPosition struct {
	ID uuid.UUID `json:"id"`
}

func issueFieldDefinition(row dbgen.IssuesFieldDefinitionRow) (command.FieldDefinition, error) {
	value, err := command.ReadFieldSlots(command.ValueKind(row.ValueKind), command.FieldSlots{
		Text:     row.DefaultText,
		Number:   command.NumberSlot(row.DefaultNumberText),
		Date:     row.DefaultDate,
		OptionID: row.DefaultOptionID,
		UserID:   row.DefaultUserID,
	})
	return command.FieldDefinition{
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
func fieldValueText(value *command.FieldValue) string {
	data, _ := json.Marshal(value)
	return string(data)
}
func customValues(ctx context.Context, m *command.Mutation, id command.IssueID, fields []uuid.UUID) (map[command.FieldID]*command.FieldValue, error) {
	rows, err := m.Queries.IssuesCustomValues(ctx, dbgen.IssuesCustomValuesParams{IssueID: id.UUID, FieldIds: fields})
	if err != nil {
		return nil, err
	}
	out := make(map[command.FieldID]*command.FieldValue, len(rows))
	for _, row := range rows {
		value, err := command.ReadFieldSlots(command.ValueKind(row.ValueKind), command.FieldSlots{
			Text:     row.TextValue,
			Number:   command.NumberSlot(row.NumberText),
			Date:     row.DateValue,
			OptionID: row.OptionID,
			UserID:   row.UserID,
		})
		if err != nil {
			return nil, err
		}
		out[command.FieldID{UUID: row.FieldID}] = value
	}
	return out, nil
}

// Resolve retained names only after the caller has authorized access to the issue.
// The supplied IDs are the bounded current field page, so this stays one query per page.
func customDisplayValues(ctx context.Context, m *command.Mutation, id command.IssueID, fields []uuid.UUID) ([]FieldValueDisplay, error) {
	rows, err := m.Queries.IssuesCustomValueDisplays(ctx, dbgen.IssuesCustomValueDisplaysParams{IssueID: id.UUID, FieldIds: fields})
	if err != nil {
		return nil, err
	}
	out := make([]FieldValueDisplay, 0, len(rows))
	for _, row := range rows {
		out = append(out, FieldValueDisplay{FieldID: command.FieldID{UUID: row.FieldID}, ReferenceID: row.ReferenceID, Label: row.Label, Retired: row.Retired})
	}
	return out, nil
}
func (s *Service) GetCustomFields(ctx context.Context, actor command.Actor, in CustomFieldsInput) (CustomFieldsView, error) {
	limit, err := in.Page.Size()
	if err != nil {
		return CustomFieldsView{}, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (CustomFieldsView, error) {
		issue, err := m.Queries.ReadIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return CustomFieldsView{}, err
		}
		configuration, err := m.Queries.ConfigurationView(ctx, issue.ProjectID)
		if err != nil {
			return CustomFieldsView{}, err
		}
		scope, err := command.CursorScopeFor(command.GetCustomFields, actor.UserID, "fieldId", struct {
			IssueID                              command.IssueID
			IssueRevision, ConfigurationRevision command.Revision
		}{in.IssueID, command.Revision(issue.Revision), command.Revision(configuration.ConfigurationRevision)})
		if err != nil {
			return CustomFieldsView{}, err
		}
		position := customFieldsPosition{}
		if in.Page.Cursor != nil {
			position, err = command.ReadCursor[customFieldsPosition](s.cursors, scope, *in.Page.Cursor)
			if err != nil {
				return CustomFieldsView{}, err
			}
		}
		rows, err := m.Queries.IssuesFieldDefinitions(ctx, dbgen.IssuesFieldDefinitionsParams{
			ProjectID: issue.ProjectID,
			HasCursor: in.Page.Cursor != nil,
			AfterID:   position.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return CustomFieldsView{}, err
		}
		defs := make([]command.FieldDefinition, 0, len(rows))
		for _, row := range rows {
			definition, err := issueFieldDefinition(dbgen.IssuesFieldDefinitionRow(row))
			if err != nil {
				return CustomFieldsView{}, err
			}
			defs = append(defs, definition)
		}
		page, err := command.BuildPage(s.cursors, scope, defs, limit, len(defs), false, func(v command.FieldDefinition) customFieldsPosition { return customFieldsPosition{v.ID.UUID} })
		if err != nil {
			return CustomFieldsView{}, err
		}
		ids := []uuid.UUID{}
		for _, field := range page.Items {
			ids = append(ids, field.ID.UUID)
		}
		values, err := customValues(ctx, m, in.IssueID, ids)
		if err != nil {
			return CustomFieldsView{}, err
		}
		assignments := []command.FieldAssignment{}
		for _, field := range page.Items {
			if value := values[field.ID]; value != nil {
				assignments = append(assignments, command.FieldAssignment{FieldID: field.ID, Value: value})
			}
		}
		displays, err := customDisplayValues(ctx, m, in.IssueID, ids)
		if err != nil {
			return CustomFieldsView{}, err
		}
		return CustomFieldsView{
			DisplayValues: displays,
			IssueID:       in.IssueID,
			Revision:      command.Revision(issue.Revision),
			Definitions:   page.Items,
			Values:        assignments,
			NextCursor:    page.NextCursor,
		}, nil
	})
}
func (s *Service) SaveCustomFields(ctx context.Context, actor command.Actor, in SaveCustomFieldsInput) (command.SaveOutcome[CustomFieldsView], error) {
	empty := command.SaveOutcome[CustomFieldsView]{}
	if in.ExpectedRevision < 1 || len(in.Values) < 1 || len(in.Values) > 100 {
		return empty, validation("values", "Supply 1-100 field assignments and the current issue revision.")
	}
	seen := map[command.FieldID]bool{}
	for _, assignment := range in.Values {
		if assignment.FieldID.UUID == uuid.Nil || seen[assignment.FieldID] {
			return empty, validation("fieldId", "Supply distinct nonzero field identifiers.")
		}
		seen[assignment.FieldID] = true
		if assignment.Value != nil {
			if err := assignment.Value.Validate(); err != nil {
				return empty, validation("value", err.Error())
			}
		}
	}
	sort.Slice(in.Values, func(i, j int) bool { return in.Values[i].FieldID.String() < in.Values[j].FieldID.String() })
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SaveCustomFields,
		RetryReference:  in.RetryReference,
		Access:          command.Access{SharedMetadata: true},
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.IssuesLockFieldRow(ctx, in.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in SaveCustomFieldsInput) (command.Change[CustomFieldsView], error) {
		empty := command.Change[CustomFieldsView]{}
		issue, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return empty, err
		}
		if err = requireModernProject(ctx, m, issue.Summary.ProjectID); err != nil {
			return empty, err
		}
		if issue.Summary.Revision != in.ExpectedRevision {
			return empty, modernConflict(issue)
		}
		ids := []uuid.UUID{}
		for _, a := range in.Values {
			ids = append(ids, a.FieldID.UUID)
		}
		old, err := customValues(ctx, m, in.IssueID, ids)
		if err != nil {
			return empty, err
		}
		definitions := []command.FieldDefinition{}
		changes := []activity.FieldChange{}
		for _, assignment := range in.Values {
			row, err := m.Queries.IssuesFieldDefinition(ctx, dbgen.IssuesFieldDefinitionParams{
				ProjectID: issue.Summary.ProjectID.UUID,
				ID:        assignment.FieldID.UUID,
			})
			if err != nil {
				return empty, unavailableIssue()
			}
			definition, err := issueFieldDefinition(row)
			if err != nil {
				return empty, err
			}
			definitions = append(definitions, definition)
			if fieldValueText(old[assignment.FieldID]) == fieldValueText(assignment.Value) {
				continue
			}
			if definition.Retired {
				return empty, validation("fieldId", "Retired fields keep historical values and cannot receive new values.")
			}
			if err = validateCustomValue(ctx, m, definition, assignment.Value); err != nil {
				return empty, err
			}
			before, after := fieldValueText(old[assignment.FieldID]), fieldValueText(assignment.Value)
			if assignment.Value == nil {
				err = m.Queries.IssuesClearCustomValue(ctx, dbgen.IssuesClearCustomValueParams{
					IssueID: in.IssueID.UUID,
					FieldID: assignment.FieldID.UUID,
				})
			} else {
				slots := assignment.Value.Slots()
				err = m.Queries.IssuesPutCustomValue(ctx, dbgen.IssuesPutCustomValueParams{
					ProjectID:   issue.Summary.ProjectID.UUID,
					IssueID:     in.IssueID.UUID,
					FieldID:     assignment.FieldID.UUID,
					ValueKind:   string(assignment.Value.Kind),
					TextValue:   slots.Text,
					NumberValue: slots.Number,
					DateValue:   slots.Date,
					OptionID:    slots.OptionID,
					UserID:      slots.UserID,
				})
			}
			if err != nil {
				return empty, err
			}
			changes = append(changes, activity.FieldChange{
				Field:  "customFields." + assignment.FieldID.String(),
				Before: &before,
				After:  &after,
			})
		}
		if err = checkRequiredFields(ctx, m, issue.Summary.ProjectID, in.IssueID); err != nil {
			return empty, err
		}
		revision := issue.Summary.Revision
		var event *string
		if len(changes) > 0 {
			if err = m.Queries.IssuesCustomValueRevision(ctx, in.IssueID.UUID); err != nil {
				return empty, err
			}
			revision++
			event, err = modernIssueEvent(ctx, m, command.SaveCustomFields, issue, changes, nil)
			if err != nil {
				return empty, err
			}
		}
		displays, err := customDisplayValues(ctx, m, in.IssueID, ids)
		if err != nil {
			return empty, err
		}
		return command.Change[CustomFieldsView]{
			Result: CustomFieldsView{
				DisplayValues: displays,
				IssueID:       in.IssueID,
				Revision:      revision,
				Definitions:   definitions,
				Values:        in.Values,
			},
			EventID:    event,
			HTTPStatus: 200,
		}, nil
	}, validateCustomFields)
}
func validateCustomFields(v CustomFieldsView) error {
	if v.IssueID.UUID == uuid.Nil || v.Revision < 1 || v.Definitions == nil || v.Values == nil {
		return errors.New("invalid custom field result")
	}
	return nil
}
func validateCustomValue(ctx context.Context, m *command.Mutation, definition command.FieldDefinition, value *command.FieldValue) error {
	if value == nil {
		if definition.Required {
			return validation("value", "A globally required field cannot be cleared.")
		}
		return nil
	}
	if value.Kind != definition.Kind {
		return validation("kind", "Use the field's configured value kind.")
	}
	if definition.Required && value.Text != nil && strings.TrimSpace(*value.Text) == "" {
		return validation("value", "Required text fields must contain text.")
	}
	if value.OptionID != nil {
		option, err := m.Queries.IssuesCustomFieldOption(ctx, dbgen.IssuesCustomFieldOptionParams{
			ProjectID: definition.ProjectID.UUID,
			FieldID:   definition.ID.UUID,
			ID:        value.OptionID.UUID,
		})
		if err != nil || option.Retired {
			return validation("optionId", "Choose an active option belonging to this field.")
		}
	}
	if value.UserID != nil {
		eligible, err := m.Queries.IssuesCustomFieldUserEligible(ctx, dbgen.IssuesCustomFieldUserEligibleParams{
			ProjectID: definition.ProjectID.UUID,
			ID:        value.UserID.UUID,
		})
		if err != nil {
			return err
		}
		if !eligible {
			return validation("userId", "Choose an active project member or administrator.")
		}
	}
	return nil
}
func checkRequiredFields(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueID) error {
	missing, err := m.Queries.IssuesMissingRequiredFields(ctx, dbgen.IssuesMissingRequiredFieldsParams{ProjectID: project.UUID, IssueID: id.UUID})
	if err != nil {
		return err
	}
	if len(missing) > 0 {
		return validation("values", "Complete required field: "+missing[0].Name)
	}
	return nil
}

func normalizeFieldAssignments(values []command.FieldAssignment) ([]command.FieldAssignment, error) {
	if len(values) > 100 {
		return nil, validation("fieldValues", "Supply at most 100 field assignments per request.")
	}
	out := append([]command.FieldAssignment(nil), values...)
	seen := map[command.FieldID]bool{}
	for _, assignment := range out {
		if assignment.FieldID.UUID == uuid.Nil || seen[assignment.FieldID] {
			return nil, validation("fieldValues", "Supply distinct, nonzero field IDs.")
		}
		seen[assignment.FieldID] = true
		if assignment.Value != nil {
			if err := assignment.Value.Validate(); err != nil {
				return nil, validation("fieldValues", err.Error())
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].FieldID.String() < out[j].FieldID.String() })
	return out, nil
}
func applyCreationFieldValues(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueID, assignments []command.FieldAssignment) ([]activity.FieldChange, error) {
	pending := map[command.FieldID]*command.FieldValue{}
	for _, assignment := range assignments {
		pending[assignment.FieldID] = assignment.Value
	}
	changes := []activity.FieldChange{}
	after := uuid.Nil
	for {
		rows, err := m.Queries.IssuesCreateFieldDefinitions(ctx, dbgen.IssuesCreateFieldDefinitionsParams{ProjectID: project.UUID, AfterID: after})
		if err != nil {
			return nil, err
		}
		count := len(rows)
		if count > 100 {
			rows = rows[:100]
		}
		for _, row := range rows {
			definition, err := issueFieldDefinition(dbgen.IssuesFieldDefinitionRow(row))
			if err != nil {
				return nil, err
			}
			value, provided := pending[definition.ID]
			if !provided {
				value = definition.DefaultValue
			}
			delete(pending, definition.ID)
			if err = validateCustomValue(ctx, m, definition, value); err != nil {
				return nil, err
			}
			if value != nil {
				slots := value.Slots()
				if err = m.Queries.IssuesPutCustomValue(ctx, dbgen.IssuesPutCustomValueParams{
					ProjectID:   project.UUID,
					IssueID:     id.UUID,
					FieldID:     definition.ID.UUID,
					ValueKind:   string(value.Kind),
					TextValue:   slots.Text,
					NumberValue: slots.Number,
					DateValue:   slots.Date,
					OptionID:    slots.OptionID,
					UserID:      slots.UserID,
				}); err != nil {
					return nil, err
				}
				encoded := fieldValueText(value)
				changes = append(changes, activity.FieldChange{Field: "customFields." + definition.ID.String(), After: &encoded})
			}
			after = row.ID
		}
		if count <= 100 {
			break
		}
	}
	if len(pending) > 0 {
		return nil, validation("fieldValues", "Creation field IDs must belong to active fields in this project.")
	}
	return changes, checkRequiredFields(ctx, m, project, id)
}

func (s *Service) BackfillFieldDefault(ctx context.Context, m *command.Mutation, project command.ProjectID, field command.FieldID, limit int) (int32, int64, *string, error) {
	if err := m.RequireProjectWrite(project); err != nil {
		return 0, 0, nil, err
	}
	row, err := m.Queries.IssuesFieldDefinition(ctx, dbgen.IssuesFieldDefinitionParams{ProjectID: project.UUID, ID: field.UUID})
	if err != nil {
		return 0, 0, nil, unavailableIssue()
	}
	definition, err := issueFieldDefinition(row)
	if err != nil {
		return 0, 0, nil, err
	}
	if definition.Retired || definition.DefaultValue == nil {
		return 0, 0, nil, validation("defaultValue", "Prepare an active field with an explicit default before backfilling.")
	}
	if err = validateCustomValue(ctx, m, definition, definition.DefaultValue); err != nil {
		return 0, 0, nil, err
	}
	ids, err := m.Queries.IssuesFieldDefaultBatch(ctx, dbgen.IssuesFieldDefaultBatchParams{
		ProjectID: project.UUID,
		FieldID:   field.UUID,
		PageSize:  int32(limit),
	})
	if err != nil {
		return 0, 0, nil, err
	}
	slots := definition.DefaultValue.Slots()
	var event *string
	for _, id := range ids {
		if err = m.Queries.IssuesPutCustomValue(ctx, dbgen.IssuesPutCustomValueParams{
			ProjectID:   project.UUID,
			IssueID:     id,
			FieldID:     field.UUID,
			ValueKind:   string(definition.Kind),
			TextValue:   slots.Text,
			NumberValue: slots.Number,
			DateValue:   slots.Date,
			OptionID:    slots.OptionID,
			UserID:      slots.UserID,
		}); err != nil {
			return 0, 0, nil, err
		}
		if err = m.Queries.IssuesCustomValueRevision(ctx, id); err != nil {
			return 0, 0, nil, err
		}
		view, err := readModernView(ctx, m, command.IssueID{UUID: id})
		if err != nil {
			return 0, 0, nil, err
		}
		after := fieldValueText(definition.DefaultValue)
		event, err = modernIssueEvent(ctx, m, command.BackfillFieldDefaults, view, []activity.FieldChange{{
			Field: "customFields." + field.String(),
			After: &after,
		}}, nil)
		if err != nil {
			return 0, 0, nil, err
		}
	}
	remaining, err := m.Queries.IssuesFieldDefaultRemaining(ctx, dbgen.IssuesFieldDefaultRemainingParams{
		ProjectID: project.UUID,
		FieldID:   field.UUID,
	})
	return int32(len(ids)), remaining, event, err
}
