package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type fieldPosition struct {
	ID uuid.UUID `json:"id"`
}
type optionPosition struct {
	Position command.Position `json:"position"`
	ID       uuid.UUID        `json:"id"`
}

func (s *Service) Fields(ctx context.Context, actor command.Actor, in ListInput) (command.Page[FieldView], error) {
	empty := command.Page[FieldView]{}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListFields, actor.UserID, "id", listScope{in.ProjectID, in.IncludeRetired})
	if err != nil {
		return empty, err
	}
	position := fieldPosition{}
	if in.Page.Cursor != nil {
		position, err = command.ReadCursor[fieldPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (command.Page[FieldView], error) {
		rows, err := m.Queries.ConfigurationFields(ctx, dbgen.ConfigurationFieldsParams{
			ProjectID:      in.ProjectID.UUID,
			IncludeRetired: in.IncludeRetired,
			HasCursor:      in.Page.Cursor != nil,
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.ConfigurationFieldCount(ctx, dbgen.ConfigurationFieldCountParams{
			ProjectID: in.ProjectID.UUID,
			Column2:   in.IncludeRetired,
		})
		if err != nil {
			return empty, err
		}
		items := make([]FieldView, 0, len(rows))
		for _, row := range rows {
			value, err := fieldView(dbgen.ConfigurationFieldRow(row))
			if err != nil {
				return empty, err
			}
			items = append(items, value)
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v FieldView) fieldPosition { return fieldPosition{v.ID.UUID} })
	})
}
func (s *Service) FieldOptions(ctx context.Context, actor command.Actor, in FieldOptionsInput) (command.Page[FieldOptionView], error) {
	empty := command.Page[FieldOptionView]{}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (command.Page[FieldOptionView], error) {
		root, err := readView(ctx, m, in.ProjectID)
		if err != nil {
			return empty, err
		}
		scope, err := command.CursorScopeFor(command.ListFieldOptions, actor.UserID, "position,id", struct {
			ProjectID command.ProjectID
			FieldID   command.FieldID
			Retired   bool
			Revision  command.Revision
		}{in.ProjectID, in.FieldID, in.IncludeRetired, root.Revision})
		if err != nil {
			return empty, err
		}
		position := optionPosition{}
		if in.Page.Cursor != nil {
			position, err = command.ReadCursor[optionPosition](s.cursors, scope, *in.Page.Cursor)
			if err != nil {
				return empty, err
			}
		}
		field, err := m.Queries.ConfigurationField(ctx, dbgen.ConfigurationFieldParams{
			ProjectID: in.ProjectID.UUID,
			ID:        in.FieldID.UUID,
		})
		if err != nil {
			return empty, unavailable()
		}
		if field.ValueKind != "choice" {
			return empty, validation("fieldId", "Choose a choice field.")
		}
		rows, err := m.Queries.ConfigurationFieldOptions(ctx, dbgen.ConfigurationFieldOptionsParams{
			ProjectID:      in.ProjectID.UUID,
			FieldID:        in.FieldID.UUID,
			IncludeRetired: in.IncludeRetired,
			HasCursor:      in.Page.Cursor != nil,
			AfterPosition:  int64(position.Position),
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.ConfigurationFieldOptionCount(ctx, dbgen.ConfigurationFieldOptionCountParams{
			ProjectID: in.ProjectID.UUID,
			FieldID:   in.FieldID.UUID,
			Column3:   in.IncludeRetired,
		})
		if err != nil {
			return empty, err
		}
		items := make([]FieldOptionView, 0, len(rows))
		for _, row := range rows {
			items = append(items, optionView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v FieldOptionView) optionPosition { return optionPosition{v.Position, v.ID.UUID} })
	})
}
