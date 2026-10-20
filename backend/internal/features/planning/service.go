package planning

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"strings"
	"time"
)

type Service struct {
	runner  command.Runner
	cursors *command.CursorSigner
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner, cursors}
}
func validKind(kind Kind) bool { return kind == Epic || kind == Release }
func validStatus(status Status) bool {
	return status == Planned || status == Active || status == Complete
}
func normalize(name, description string, status Status, date *command.CalendarDate) (string, error) {
	name = strings.TrimSpace(name)
	if command.ValidateText(name, 1, 100) != nil {
		return "", validation("name", "Use a name of 1–100 characters.")
	}
	if command.ValidateText(description, 0, 2000) != nil {
		return "", validation("description", "Descriptions may contain up to 2000 characters.")
	}
	if !validStatus(status) {
		return "", validation("status", "Choose planned, active or complete.")
	}
	if date != nil {
		if _, err := command.ParseDate(date.String()); err != nil {
			return "", validation("targetDate", "Choose a valid date.")
		}
	}
	return name, nil
}
func dateParam(value *command.CalendarDate) pgtype.Date {
	if value == nil {
		return pgtype.Date{}
	}
	parsed, _ := time.Parse("2006-01-02", value.String())
	return pgtype.Date{Time: parsed, Valid: true}
}
func dateView(value pgtype.Date) *command.CalendarDate {
	if !value.Valid {
		return nil
	}
	date, _ := command.ParseDate(value.Time.Format("2006-01-02"))
	return &date
}
func itemView(row dbgen.PlanningItem, progress dbgen.PlanningProgressRow) PlanningItemView {
	return PlanningItemView{
		ID:             ID{UUID: row.ID},
		ProjectID:      command.ProjectID{UUID: row.ProjectID},
		Kind:           Kind(row.Kind),
		Name:           row.Name,
		Description:    row.Description,
		TargetDate:     dateView(row.TargetDate),
		Status:         Status(row.Status),
		Revision:       command.Revision(row.Revision),
		IssueCount:     progress.IssueCount,
		CompletedCount: progress.CompletedCount,
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}
}
func validateItem(value PlanningItemView) error {
	if value.ID.UUID == uuid.Nil || value.ProjectID.UUID == uuid.Nil || value.Revision < 1 || !validKind(value.Kind) || value.CreatedAt.IsZero() || value.UpdatedAt.IsZero() || value.CompletedCount < 0 || value.IssueCount < value.CompletedCount {
		return errors.New("invalid planning result")
	}
	_, err := normalize(value.Name, value.Description, value.Status, value.TargetDate)
	return err
}
func readItem(ctx context.Context, m *command.Mutation, id ID, project command.ProjectID) (PlanningItemView, error) {
	row, err := m.Queries.PlanningGet(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || row.ProjectID != project.UUID {
		return PlanningItemView{}, unavailable()
	}
	if err != nil {
		return PlanningItemView{}, err
	}
	progress, err := m.Queries.PlanningProgress(ctx, &id.UUID)
	return itemView(row, progress), err
}
func noAuth(context.Context, *command.Mutation) error { return nil }
func itemEvent(ctx context.Context, m *command.Mutation, operation command.Operation, view PlanningItemView, changes []activity.FieldChange) (*string, error) {
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       operation,
		ResourceKind: activity.ProjectResource,
		ResourceID:   view.ID.UUID,
		ProjectID:    &view.ProjectID,
		Changes:      changes,
	})
	if err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func change(name, before, after string) activity.FieldChange {
	return activity.FieldChange{Field: name, Before: &before, After: &after}
}
func dateText(value *command.CalendarDate) string {
	if value == nil {
		return ""
	}
	return value.String()
}
func (s *Service) Create(ctx context.Context, actor command.Actor, in PlanningCreateInput) (command.SaveOutcome[PlanningItemView], error) {
	name, err := normalize(in.Name, in.Description, in.Status, in.TargetDate)
	if err != nil {
		return command.SaveOutcome[PlanningItemView]{}, err
	}
	if !validKind(in.Kind) {
		return command.SaveOutcome[PlanningItemView]{}, validation("kind", "Choose epic or release.")
	}
	in.Name = name
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreatePlanningItem,
		RetryReference: in.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, in, noAuth, func(ctx context.Context, m *command.Mutation, in PlanningCreateInput) (command.Change[PlanningItemView], error) {
		row, err := m.Queries.PlanningInsert(ctx, dbgen.PlanningInsertParams{
			ID:          uuid.New(),
			ProjectID:   in.ProjectID.UUID,
			Kind:        string(in.Kind),
			Name:        in.Name,
			Description: in.Description,
			TargetDate:  dateParam(in.TargetDate),
			Status:      string(in.Status),
			CreatedBy:   actor.UserID.UUID,
		})
		if err != nil {
			return command.Change[PlanningItemView]{}, err
		}
		view := itemView(row, dbgen.PlanningProgressRow{})
		event, err := itemEvent(ctx, m, command.CreatePlanningItem, view, []activity.FieldChange{
			change("planningKind", "", string(view.Kind)),
			change("name", "", view.Name),
			change("description", "", view.Description),
			change("planningStatus", "", string(view.Status)),
			change("targetDate", "", dateText(view.TargetDate)),
		})
		return command.Change[PlanningItemView]{Result: view, EventID: event, HTTPStatus: 201}, err
	}, validateItem)
}
func (s *Service) Update(ctx context.Context, actor command.Actor, in PlanningUpdateInput) (command.SaveOutcome[PlanningItemView], error) {
	name, err := normalize(in.Name, in.Description, in.Status, in.TargetDate)
	if err != nil {
		return command.SaveOutcome[PlanningItemView]{}, err
	}
	if in.ExpectedRevision < 1 {
		return command.SaveOutcome[PlanningItemView]{}, validation("expectedRevision", "Read the current planning revision.")
	}
	in.Name = name
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.UpdatePlanningItem,
		RetryReference: in.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		_, err := readItem(ctx, m, in.PlanningID, in.ProjectID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in PlanningUpdateInput) (command.Change[PlanningItemView], error) {
		current, err := readItem(ctx, m, in.PlanningID, in.ProjectID)
		if err != nil {
			return command.Change[PlanningItemView]{}, err
		}
		if current.Revision != in.ExpectedRevision {
			return command.Change[PlanningItemView]{}, stale(&current)
		}
		changes := []activity.FieldChange{}
		for _, field := range []activity.FieldChange{
			change("name", current.Name, in.Name),
			change("description", current.Description, in.Description),
			change("planningStatus", string(current.Status), string(in.Status)),
			change("targetDate", dateText(current.TargetDate), dateText(in.TargetDate)),
		} {
			if *field.Before != *field.After {
				changes = append(changes, field)
			}
		}
		if len(changes) == 0 {
			return command.Change[PlanningItemView]{Result: current, HTTPStatus: 200}, nil
		}
		_, err = m.Queries.PlanningUpdate(ctx, dbgen.PlanningUpdateParams{
			ID:          in.PlanningID.UUID,
			ProjectID:   in.ProjectID.UUID,
			Name:        in.Name,
			Description: in.Description,
			Status:      string(in.Status),
			TargetDate:  dateParam(in.TargetDate),
		})
		if err != nil {
			return command.Change[PlanningItemView]{}, err
		}
		view, err := readItem(ctx, m, in.PlanningID, in.ProjectID)
		if err != nil {
			return command.Change[PlanningItemView]{}, err
		}
		event, err := itemEvent(ctx, m, command.UpdatePlanningItem, view, changes)
		return command.Change[PlanningItemView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateItem)
}
func issueScopes(id command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		issue, err := m.Queries.ReadIssue(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: issue.ProjectID}, Write: write}}, nil
	}
}
func readAssignment(ctx context.Context, m *command.Mutation, id command.IssueID) (IssuePlanningView, error) {
	row, err := m.Queries.PlanningIssueGet(ctx, id.UUID)
	if err != nil {
		return IssuePlanningView{}, err
	}
	view := IssuePlanningView{
		IssueID:     id,
		ProjectID:   command.ProjectID{UUID: row.ProjectID},
		Revision:    command.InitialRevision(row.Revision),
		EpicName:    row.EpicName,
		ReleaseName: row.ReleaseName,
	}
	if row.EpicID != nil {
		view.EpicID = &ID{UUID: *row.EpicID}
	}
	if row.ReleaseID != nil {
		view.ReleaseID = &ID{UUID: *row.ReleaseID}
	}
	return view, nil
}
func validateAssignment(value IssuePlanningView) error {
	if value.IssueID.UUID == uuid.Nil || value.ProjectID.UUID == uuid.Nil || value.Revision < 0 {
		return errors.New("invalid issue planning")
	}
	return nil
}
func (s *Service) GetIssue(ctx context.Context, actor command.Actor, in GetIssueInput) (IssuePlanningView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (IssuePlanningView, error) {
		return readAssignment(ctx, m, in.IssueID)
	})
}
func idText(id *ID) string {
	if id == nil {
		return ""
	}
	return id.String()
}
func uuidPtr(id *ID) *uuid.UUID {
	if id == nil {
		return nil
	}
	return &id.UUID
}
func (s *Service) SetIssue(ctx context.Context, actor command.Actor, in IssuePlanningInput) (command.SaveOutcome[IssuePlanningView], error) {
	if in.ExpectedRevision < 0 {
		return command.SaveOutcome[IssuePlanningView]{}, validation("expectedRevision", "Read current planning assignments.")
	}
	for _, id := range []*ID{in.EpicID, in.ReleaseID} {
		if id != nil && id.UUID == uuid.Nil {
			return command.SaveOutcome[IssuePlanningView]{}, validation("planningId", "Select a planning item or clear the field.")
		}
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SetIssuePlanning,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, noAuth, func(ctx context.Context, m *command.Mutation, in IssuePlanningInput) (command.Change[IssuePlanningView], error) {
		current, err := readAssignment(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssuePlanningView]{}, err
		}
		issue, err := m.Queries.ReadIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return command.Change[IssuePlanningView]{}, err
		}
		if issue.Archived {
			return command.Change[IssuePlanningView]{}, validation("issueId", "Restore the issue before changing its planning assignments.")
		}
		if current.Revision != in.ExpectedRevision {
			return command.Change[IssuePlanningView]{}, stale(nil)
		}
		for _, selection := range []struct {
			id   *ID
			kind Kind
		}{{in.EpicID, Epic}, {in.ReleaseID, Release}} {
			if selection.id != nil {
				item, err := readItem(ctx, m, *selection.id, current.ProjectID)
				if err != nil {
					return command.Change[IssuePlanningView]{}, err
				}
				if item.Kind != selection.kind {
					return command.Change[IssuePlanningView]{}, validation("planningId", "Select a planning item of the correct kind in this project.")
				}
			}
		}
		changes := []activity.FieldChange{}
		for _, field := range []activity.FieldChange{
			change("epicId", idText(current.EpicID), idText(in.EpicID)),
			change("releaseId", idText(current.ReleaseID), idText(in.ReleaseID)),
		} {
			if *field.Before != *field.After {
				changes = append(changes, field)
			}
		}
		if len(changes) == 0 {
			return command.Change[IssuePlanningView]{Result: current, HTTPStatus: 200}, nil
		}
		err = m.Queries.PlanningIssueSet(ctx, dbgen.PlanningIssueSetParams{
			IssueID:   in.IssueID.UUID,
			ProjectID: current.ProjectID.UUID,
			EpicID:    uuidPtr(in.EpicID),
			ReleaseID: uuidPtr(in.ReleaseID),
		})
		if err != nil {
			return command.Change[IssuePlanningView]{}, err
		}
		view, err := readAssignment(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssuePlanningView]{}, err
		}
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SetIssuePlanning,
			ResourceKind: activity.IssueResource,
			ResourceID:   in.IssueID.UUID,
			ProjectID:    &view.ProjectID,
			IssueID:      &view.IssueID,
			Changes:      changes,
		})
		if err != nil {
			return command.Change[IssuePlanningView]{}, err
		}
		id := event.ID.String()
		return command.Change[IssuePlanningView]{Result: view, EventID: &id, HTTPStatus: 200}, nil
	}, validateAssignment)
}
