package configuration

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The configuration item is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}

type Conflict struct {
	Failure *command.Failure
	Current ConfigurationView
}

func (e *Conflict) Error() string { return e.Failure.Message }
func (e *Conflict) Unwrap() error { return e.Failure }
func conflict(view ConfigurationView) error {
	return &Conflict{
		&command.Failure{
			Code:        command.Conflict,
			Message:     "Project configuration changed. Review the current choices before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		view,
	}
}
func normalize(key, name string) (string, error) {
	name = strings.TrimSpace(name)
	if !keyPattern.MatchString(key) {
		return "", validation("key", "Use a stable lowercase key with letters, digits or underscores.")
	}
	if command.ValidateText(name, 1, 60) != nil {
		return "", validation("name", "Use a name of 1–60 characters.")
	}
	return name, nil
}
func validateView(v ConfigurationView) error {
	if v.ProjectID.UUID == uuid.Nil || v.Revision < 1 || (v.Mode != Legacy && v.Mode != Modern) || v.Defaults.StandardTypeID.UUID == uuid.Nil || v.Defaults.SubtaskTypeID.UUID == uuid.Nil || v.Defaults.PriorityID.UUID == uuid.Nil {
		return errors.New("invalid project configuration")
	}
	return nil
}
func readView(ctx context.Context, m *command.Mutation, project command.ProjectID) (ConfigurationView, error) {
	row, err := m.Queries.ConfigurationView(ctx, project.UUID)
	if err != nil {
		return ConfigurationView{}, err
	}
	permissions, err := m.ProjectPermissions(project)
	if err != nil {
		return ConfigurationView{}, err
	}
	v := ConfigurationView{ProjectID: project, Revision: command.Revision(row.ConfigurationRevision), Mode: CoreMode(row.CoreMode), CanManage: permissions.CanConfigure,
		Defaults: Defaults{
			StandardTypeID: command.IssueTypeID{UUID: row.StandardTypeID},
			SubtaskTypeID:  command.IssueTypeID{UUID: row.SubtaskTypeID},
			PriorityID:     command.PriorityID{UUID: row.PriorityID},
		}}
	return v, validateView(v)
}
func (s *Service) Get(ctx context.Context, actor command.Actor, input GetInput) (ConfigurationView, error) {
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (ConfigurationView, error) {
		return readView(ctx, m, input.ProjectID)
	})
}
func typeView(row dbgen.IssueType) TypeView {
	return TypeView{
		ID:        command.IssueTypeID{UUID: row.ID},
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		Key:       row.Key,
		Name:      row.Name,
		Behavior:  TypeBehavior(row.Behavior),
		Default:   row.IsDefault,
		Retired:   row.Retired,
	}
}
func priorityView(row dbgen.Priority) PriorityView {
	return PriorityView{
		ID:        command.PriorityID{UUID: row.ID},
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		Key:       row.Key,
		Name:      row.Name,
		SortOrder: command.Position(row.SortOrder),
		Default:   row.IsDefault,
		Retired:   row.Retired,
	}
}
func readType(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueTypeID) (dbgen.IssueType, error) {
	row, err := m.Queries.ConfigurationType(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.ProjectID != project.UUID) {
		return row, unavailable()
	}
	return row, err
}
func readPriority(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.PriorityID) (dbgen.Priority, error) {
	row, err := m.Queries.ConfigurationPriority(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.ProjectID != project.UUID) {
		return row, unavailable()
	}
	return row, err
}
func request(actor command.Actor, operation command.Operation, project command.ProjectID, reference string) command.MutationRequest {
	return command.MutationRequest{
		Actor:          actor,
		Operation:      operation,
		RetryReference: reference,
		Access: command.Access{Projects: []command.ProjectScope{{
			ProjectID: project,
			Write:     true,
			Configure: true,
		}}},
	}
}
func ensureRevision(ctx context.Context, m *command.Mutation, project command.ProjectID, expected command.Revision) (ConfigurationView, error) {
	current, err := readView(ctx, m, project)
	if err != nil {
		return current, err
	}
	if expected != current.Revision {
		return current, conflict(current)
	}
	return current, nil
}
func configurationEvent(ctx context.Context, m *command.Mutation, operation command.Operation, project command.ProjectID, changes []activity.FieldChange) (*string, error) {
	if err := m.Queries.ConfigurationAdvance(ctx, project.UUID); err != nil {
		return nil, err
	}
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       operation,
		ResourceKind: activity.ProjectResource,
		ResourceID:   project.UUID,
		ProjectID:    &project,
		Changes:      changes,
	})
	if err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func change(field, before, after string) activity.FieldChange {
	return activity.FieldChange{Field: field, Before: &before, After: &after}
}
func eligibleType(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueTypeID, behavior TypeBehavior) (dbgen.IssueType, uuid.UUID, error) {
	row, err := readType(ctx, m, project, id)
	if err != nil {
		return row, uuid.Nil, err
	}
	if row.Retired || row.Behavior != string(behavior) {
		return row, uuid.Nil, validation("defaults", "Choose an active type with the matching behavior.")
	}
	flow, err := m.Queries.ConfigurationEligibleTypeFlow(ctx, dbgen.ConfigurationEligibleTypeFlowParams{ProjectID: project.UUID, TypeID: id.UUID})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, uuid.Nil, validation("defaults", "A default type needs an active workflow whose initial stage accepts entries.")
	}
	return row, flow, err
}
func eligiblePriority(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.PriorityID) (dbgen.Priority, error) {
	row, err := readPriority(ctx, m, project, id)
	if err == nil && row.Retired {
		return row, validation("defaults", "Choose an active priority.")
	}
	return row, err
}
func replaceTypeDefault(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.IssueTypeID, behavior TypeBehavior) error {
	if _, _, err := eligibleType(ctx, m, project, id, behavior); err != nil {
		return err
	}
	if err := m.Queries.ConfigurationClearTypeDefault(ctx, dbgen.ConfigurationClearTypeDefaultParams{
		ProjectID: project.UUID,
		Behavior:  string(behavior),
	}); err != nil {
		return err
	}
	return m.Queries.ConfigurationSetTypeDefault(ctx, id.UUID)
}
func replacePriorityDefault(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.PriorityID) error {
	if _, err := eligiblePriority(ctx, m, project, id); err != nil {
		return err
	}
	if err := m.Queries.ConfigurationClearPriorityDefault(ctx, project.UUID); err != nil {
		return err
	}
	return m.Queries.ConfigurationSetPriorityDefault(ctx, id.UUID)
}
func uniqueError(err error) error {
	var failure *pgconn.PgError
	if errors.As(err, &failure) && failure.Code == "23505" {
		return validation("key", "That stable key already belongs to another item in this project.")
	}
	return err
}
