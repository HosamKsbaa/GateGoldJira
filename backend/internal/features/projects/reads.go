package projects

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

func (service *Service) Get(ctx context.Context, actor command.Actor, id command.ProjectID) (ProjectView, error) {
	return command.Read(ctx, service.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: id}}}, func(ctx context.Context, mutation *command.Mutation) (ProjectView, error) {
		row, err := mutation.Queries.ReadProject(ctx, id.UUID)
		if err != nil {
			return ProjectView{}, err
		}
		role := Administrator
		if !mutation.User.IsAdministrator {
			membership, err := mutation.Queries.ReadMembership(ctx, dbgen.ReadMembershipParams{
				ProjectID: id.UUID,
				UserID:    actor.UserID.UUID,
			})
			if err != nil {
				return ProjectView{}, err
			}
			role = EffectiveRole(membership.Role)
		}
		return viewProject(row, role), nil
	})
}

type projectPosition struct {
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}
type listFilters struct {
	IncludeArchived bool `json:"includeArchived"`
}

func (service *Service) List(ctx context.Context, actor command.Actor, input ListInput) (command.Page[ProjectView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[ProjectView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListProjects, actor.UserID, "name,id", listFilters{input.IncludeArchived})
	if err != nil {
		return command.Page[ProjectView]{}, err
	}
	position := projectPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[projectPosition](service.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[ProjectView]{}, err
		}
	}
	return command.Read(ctx, service.runner, actor, command.Access{}, func(ctx context.Context, mutation *command.Mutation) (command.Page[ProjectView], error) {
		rows, err := mutation.Queries.ProjectsList(ctx, dbgen.ProjectsListParams{
			CallerID:        actor.UserID.UUID,
			IsAdmin:         mutation.User.IsAdministrator,
			IncludeArchived: input.IncludeArchived,
			HasCursor:       input.Page.Cursor != nil,
			AfterName:       position.Name,
			AfterID:         position.ID,
			PageSize:        int32(limit + 1),
		})
		if err != nil {
			return command.Page[ProjectView]{}, err
		}
		count, err := mutation.Queries.ProjectsCount(ctx, dbgen.ProjectsCountParams{
			CallerID:        actor.UserID.UUID,
			IsAdmin:         mutation.User.IsAdministrator,
			IncludeArchived: input.IncludeArchived,
		})
		if err != nil {
			return command.Page[ProjectView]{}, err
		}
		items := []ProjectView{}
		for _, row := range rows {
			items = append(items, ProjectView{
				ID:            command.ProjectID{UUID: row.ID},
				Key:           row.Key,
				Name:          row.Name,
				Description:   row.Description,
				Archived:      row.ArchivedAt.Valid,
				Revision:      command.Revision(row.Revision),
				CreatedAt:     row.CreatedAt.Time,
				UpdatedAt:     row.UpdatedAt.Time,
				EffectiveRole: EffectiveRole(row.EffectiveRole),
			})
		}
		return command.BuildPage(service.cursors, scope, items, limit, int(count), false, func(item ProjectView) projectPosition { return projectPosition{item.Name, item.ID.UUID} })
	})
}
