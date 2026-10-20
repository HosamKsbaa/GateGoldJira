package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/text/cases"
	"strings"
)

type CreateLabelFields struct {
	Name string `json:"name" minLength:"1" maxLength:"40"`
}
type CreateLabelInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	CreateLabelFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ListLabelsInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Query     string              `json:"query,omitempty" maxLength:"40"`
	Page      command.PageRequest `json:"page,omitempty"`
}
type labelPosition struct {
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}
type labelCommand struct {
	ProjectID command.ProjectID `json:"projectId"`
	Name      string            `json:"name"`
	NameKey   string            `json:"nameKey"`
}

func labelView(row dbgen.Label) LabelView {
	return LabelView{ID: command.LabelID{UUID: row.ID}, ProjectID: command.ProjectID{UUID: row.ProjectID}, Name: row.Name}
}
func validLabel(v LabelView) error {
	if v.ID.UUID == uuid.Nil || v.ProjectID.UUID == uuid.Nil {
		return errors.New("invalid label identity")
	}
	return command.ValidateText(v.Name, 1, 40)
}

func (s *Service) CreateLabel(ctx context.Context, actor command.Actor, in CreateLabelInput) (command.SaveOutcome[LabelView], error) {
	name := strings.TrimSpace(in.Name)
	if command.ValidateText(name, 1, 40) != nil {
		return command.SaveOutcome[LabelView]{}, validation("name", "Label names must contain 1–40 characters.")
	}
	args := labelCommand{in.ProjectID, name, cases.Fold().String(name)}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateLabel,
		RetryReference: in.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, args, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, a labelCommand) (command.Change[LabelView], error) {
		// The project write lock serializes name reuse, including simultaneous writers.
		existing, err := m.Queries.IssuesFindLabel(ctx, dbgen.IssuesFindLabelParams{
			ProjectID: a.ProjectID.UUID,
			NameKey:   a.NameKey,
		})
		if err == nil {
			return command.Change[LabelView]{Result: labelView(existing), HTTPStatus: 200}, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return command.Change[LabelView]{}, err
		}
		id := command.NewID[command.LabelKind]()
		row, err := m.Queries.IssuesInsertLabel(ctx, dbgen.IssuesInsertLabelParams{
			ID:        id.UUID,
			ProjectID: a.ProjectID.UUID,
			Name:      a.Name,
			NameKey:   a.NameKey,
			CreatedBy: m.User.ID,
		})
		if err != nil {
			return command.Change[LabelView]{}, err
		}
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.CreateLabel,
			ResourceKind: activity.LabelResource,
			ResourceID:   id.UUID,
			ProjectID:    &a.ProjectID,
			Changes:      []activity.FieldChange{{Field: "name", After: &a.Name}},
		})
		if err != nil {
			return command.Change[LabelView]{}, err
		}
		eventID := event.ID.String()
		return command.Change[LabelView]{Result: labelView(row), EventID: &eventID, HTTPStatus: 201}, nil
	}, validLabel)
}
func (s *Service) Labels(ctx context.Context, actor command.Actor, in ListLabelsInput) (command.Page[LabelView], error) {
	empty := command.Page[LabelView]{}
	query := cases.Fold().String(strings.TrimSpace(in.Query))
	if command.ValidateText(strings.TrimSpace(in.Query), 0, 40) != nil {
		return empty, validation("query", "Use at most 40 characters to find labels.")
	}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListLabels, actor.UserID, "nameKey,id", struct {
		Project command.ProjectID `json:"projectId"`
		Query   string            `json:"query"`
	}{in.ProjectID, query})
	if err != nil {
		return empty, err
	}
	after := labelPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[labelPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (command.Page[LabelView], error) {
		rows, err := m.Queries.IssuesListLabels(ctx, dbgen.IssuesListLabelsParams{
			ProjectID: in.ProjectID.UUID,
			Query:     query,
			HasCursor: in.Page.Cursor != nil,
			AfterName: after.Name,
			AfterID:   after.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.IssuesCountLabels(ctx, dbgen.IssuesCountLabelsParams{
			ProjectID: in.ProjectID.UUID,
			Column2:   query,
		})
		if err != nil {
			return empty, err
		}
		values := []LabelView{}
		positions := map[command.LabelID]labelPosition{}
		for _, row := range rows {
			view := labelView(row)
			if err := validLabel(view); err != nil {
				return empty, err
			}
			values = append(values, view)
			positions[view.ID] = labelPosition{row.NameKey, row.ID}
		}
		return command.BuildPage(s.cursors, scope, values, limit, int(count), false, func(v LabelView) labelPosition { return positions[v.ID] })
	})
}
