package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type typePosition struct {
	Key string    `json:"key"`
	ID  uuid.UUID `json:"id"`
}
type priorityPosition struct {
	Order command.Position `json:"order"`
	ID    uuid.UUID        `json:"id"`
}
type listScope struct {
	Project        command.ProjectID `json:"projectId"`
	IncludeRetired bool              `json:"includeRetired"`
}

func (s *Service) Types(ctx context.Context, actor command.Actor, input ListInput) (command.Page[TypeView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[TypeView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListIssueTypes, actor.UserID, "key,id", listScope{input.ProjectID, input.IncludeRetired})
	if err != nil {
		return command.Page[TypeView]{}, err
	}
	position := typePosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[typePosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[TypeView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[TypeView], error) {
		rows, err := m.Queries.ConfigurationTypes(ctx, dbgen.ConfigurationTypesParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
			HasCursor:      input.Page.Cursor != nil,
			AfterKey:       position.Key,
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[TypeView]{}, err
		}
		total, err := m.Queries.ConfigurationTypeCount(ctx, dbgen.ConfigurationTypeCountParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
		})
		if err != nil {
			return command.Page[TypeView]{}, err
		}
		items := make([]TypeView, 0, len(rows))
		for _, row := range rows {
			items = append(items, typeView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v TypeView) typePosition { return typePosition{v.Key, v.ID.UUID} })
	})
}
func (s *Service) Priorities(ctx context.Context, actor command.Actor, input ListInput) (command.Page[PriorityView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[PriorityView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListPriorities, actor.UserID, "sortOrder,id", listScope{input.ProjectID, input.IncludeRetired})
	if err != nil {
		return command.Page[PriorityView]{}, err
	}
	position := priorityPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[priorityPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[PriorityView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[PriorityView], error) {
		rows, err := m.Queries.ConfigurationPriorityList(ctx, dbgen.ConfigurationPriorityListParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
			HasCursor:      input.Page.Cursor != nil,
			AfterOrder:     int64(position.Order),
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[PriorityView]{}, err
		}
		total, err := m.Queries.ConfigurationPriorityCount(ctx, dbgen.ConfigurationPriorityCountParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
		})
		if err != nil {
			return command.Page[PriorityView]{}, err
		}
		items := make([]PriorityView, 0, len(rows))
		for _, row := range rows {
			items = append(items, priorityView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v PriorityView) priorityPosition { return priorityPosition{v.SortOrder, v.ID.UUID} })
	})
}
