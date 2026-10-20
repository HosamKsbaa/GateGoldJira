package identity

import (
	"context"
	"strings"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type namePosition struct {
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}

func position[F any](service *Service, actor command.Actor, operation command.Operation, page command.PageRequest, filters F) (command.CursorScope, namePosition, int, error) {
	// Filters are closed concrete feature values, never a dynamic input map.
	limit, err := page.Size()
	if err != nil {
		return command.CursorScope{}, namePosition{}, 0, err
	}
	scope, err := command.CursorScopeFor(operation, actor.UserID, "displayName,id", filters)
	if err != nil {
		return scope, namePosition{}, 0, err
	}
	position := namePosition{}
	if page.Cursor != nil {
		position, err = command.ReadCursor[namePosition](service.cursors, scope, *page.Cursor)
		if err != nil {
			return scope, position, 0, err
		}
	}
	return scope, position, limit, nil
}

type userFilters struct{}

type membershipFilters struct {
	ProjectID      command.ProjectID `json:"projectId"`
	IncludeRemoved bool              `json:"includeRemoved"`
}

type candidateFilters struct {
	ProjectID command.ProjectID `json:"projectId"`
	Query     string            `json:"query"`
}

func (service *Service) ListUsers(ctx context.Context, actor command.Actor, page command.PageRequest) (command.Page[UserView], error) {
	scope, position, limit, err := position(service, actor, command.ListUsers, page, userFilters{})
	if err != nil {
		return command.Page[UserView]{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{AdministratorOnly: true}, func(ctx context.Context, mutation *command.Mutation) (command.Page[UserView], error) {
		rows, err := mutation.Queries.IdentityListUsers(ctx, dbgen.IdentityListUsersParams{
			HasCursor: page.Cursor != nil,
			AfterName: position.Name,
			AfterID:   position.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return command.Page[UserView]{}, err
		}
		count, err := mutation.Queries.IdentityCountUsers(ctx)
		if err != nil {
			return command.Page[UserView]{}, err
		}
		users := []UserView{}
		for _, row := range rows {
			users = append(users, viewUser(row))
		}
		return command.BuildPage(service.cursors, scope, users, limit, int(count), false, func(user UserView) namePosition { return namePosition{user.DisplayName, user.ID.UUID} })
	})
}
func (service *Service) ListMemberships(ctx context.Context, actor command.Actor, input MembershipListInput) (command.Page[MembershipView], error) {
	scope, position, limit, err := position(service, actor, command.ListMemberships, input.Page, membershipFilters{input.ProjectID, input.IncludeRemoved})
	if err != nil {
		return command.Page[MembershipView]{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID, Configure: true}}}, func(ctx context.Context, mutation *command.Mutation) (command.Page[MembershipView], error) {
		rows, err := mutation.Queries.IdentityListMemberships(ctx, dbgen.IdentityListMembershipsParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRemoved: input.IncludeRemoved,
			HasCursor:      input.Page.Cursor != nil,
			AfterName:      position.Name,
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[MembershipView]{}, err
		}
		count, err := mutation.Queries.IdentityCountMemberships(ctx, dbgen.IdentityCountMembershipsParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRemoved: input.IncludeRemoved,
		})
		if err != nil {
			return command.Page[MembershipView]{}, err
		}
		items := []MembershipView{}
		for _, row := range rows {
			items = append(items, MembershipView{
				ProjectID: input.ProjectID,
				User: UserSummary{
					command.UserID{UUID: row.UserID},
					row.DisplayName,
				},
				Role:     command.Role(row.Role),
				Removed:  row.RemovedAt.Valid,
				Revision: command.Revision(row.Revision),
			})
		}
		return command.BuildPage(service.cursors, scope, items, limit, int(count), false, func(item MembershipView) namePosition { return namePosition{item.User.DisplayName, item.User.ID.UUID} })
	})
}
func (service *Service) ListAssignees(ctx context.Context, actor command.Actor, input CandidateInput) (command.Page[UserSummary], error) {
	return service.listCandidates(ctx, actor, input, true)
}
func (service *Service) ListMentionCandidates(ctx context.Context, actor command.Actor, input CandidateInput) (command.Page[UserSummary], error) {
	return service.listCandidates(ctx, actor, input, false)
}
func (service *Service) listCandidates(ctx context.Context, actor command.Actor, input CandidateInput, assignees bool) (command.Page[UserSummary], error) {
	input.Query = strings.TrimSpace(input.Query)
	if command.ValidateText(input.Query, 0, 100) != nil {
		return command.Page[UserSummary]{}, validation("query", "Search text must contain at most 100 characters.")
	}
	operation := command.ListMentionCandidates
	if assignees {
		operation = command.ListAssignees
	}
	scope, position, limit, err := position(service, actor, operation, input.Page, candidateFilters{input.ProjectID, input.Query})
	if err != nil {
		return command.Page[UserSummary]{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, mutation *command.Mutation) (command.Page[UserSummary], error) {
		rows, err := mutation.Queries.IdentityListCandidates(ctx, dbgen.IdentityListCandidatesParams{
			ProjectID:     input.ProjectID.UUID,
			AssigneesOnly: assignees,
			Query:         input.Query,
			HasCursor:     input.Page.Cursor != nil,
			AfterName:     position.Name,
			AfterID:       position.ID,
			PageSize:      int32(limit + 1),
		})
		if err != nil {
			return command.Page[UserSummary]{}, err
		}
		count, err := mutation.Queries.IdentityCountCandidates(ctx, dbgen.IdentityCountCandidatesParams{
			ProjectID:     input.ProjectID.UUID,
			AssigneesOnly: assignees,
			Query:         input.Query,
		})
		if err != nil {
			return command.Page[UserSummary]{}, err
		}
		items := []UserSummary{}
		for _, row := range rows {
			items = append(items, UserSummary{command.UserID{UUID: row.ID}, row.DisplayName})
		}
		return command.BuildPage(service.cursors, scope, items, limit, int(count), false, func(item UserSummary) namePosition { return namePosition{item.DisplayName, item.ID.UUID} })
	})
}

func (service *Service) ListMembershipCandidates(ctx context.Context, actor command.Actor, input CandidateInput) (command.Page[MembershipCandidateView], error) {
	input.Query = strings.TrimSpace(input.Query)
	if command.ValidateText(input.Query, 0, 100) != nil {
		return command.Page[MembershipCandidateView]{}, validation("query", "Search text must contain at most 100 characters.")
	}
	scope, position, limit, err := position(service, actor, command.ListMembershipCandidates, input.Page, candidateFilters{input.ProjectID, input.Query})
	if err != nil {
		return command.Page[MembershipCandidateView]{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID, Configure: true}}}, func(ctx context.Context, m *command.Mutation) (command.Page[MembershipCandidateView], error) {
		rows, err := m.Queries.IdentityMembershipCandidates(ctx, dbgen.IdentityMembershipCandidatesParams{
			Query:     input.Query,
			HasCursor: input.Page.Cursor != nil,
			AfterName: position.Name,
			AfterID:   position.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return command.Page[MembershipCandidateView]{}, err
		}
		total, err := m.Queries.IdentityMembershipCandidateCount(ctx, input.Query)
		if err != nil {
			return command.Page[MembershipCandidateView]{}, err
		}
		people := make([]MembershipCandidateView, 0, len(rows))
		for _, row := range rows {
			people = append(people, MembershipCandidateView{
				ID:          command.UserID{UUID: row.ID},
				DisplayName: row.DisplayName,
				Active:      row.Active,
			})
		}
		return command.BuildPage(service.cursors, scope, people, limit, int(total), false, func(v MembershipCandidateView) namePosition { return namePosition{Name: v.DisplayName, ID: v.ID.UUID} })
	})
}
