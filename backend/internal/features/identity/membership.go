package identity

import (
	"context"
	"errors"
	"strconv"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type setMembershipCommand struct {
	ProjectID        command.ProjectID       `json:"projectId"`
	UserID           command.UserID          `json:"userId"`
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	Role             command.Role            `json:"role"`
}
type removeMembershipCommand struct {
	ProjectID        command.ProjectID `json:"projectId"`
	UserID           command.UserID    `json:"userId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
}

func membershipView(row dbgen.ProjectMembership, user dbgen.User) MembershipView {
	return MembershipView{
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		User: UserSummary{
			command.UserID{UUID: user.ID},
			user.DisplayName,
		},
		Role:     command.Role(row.Role),
		Removed:  row.RemovedAt.Valid,
		Revision: command.Revision(row.Revision),
	}
}
func validateMembership(view MembershipView) error {
	if view.ProjectID.UUID == uuid.Nil || view.User.ID.UUID == uuid.Nil || !view.Role.Valid() || view.Revision < 1 {
		return errors.New("invalid membership result")
	}
	return command.ValidateText(view.User.DisplayName, 1, 100)
}
func membershipRequest(actor command.Actor, operation command.Operation, project command.ProjectID, reference string) command.MutationRequest {
	return command.MutationRequest{
		Actor:          actor,
		Operation:      operation,
		RetryReference: reference,
		Access: command.Access{
			CompanyExclusive: true,
			Projects: []command.ProjectScope{{
				ProjectID:     project,
				Write:         true,
				Configure:     true,
				AllowArchived: true,
			}},
		},
	}
}
func saveMembershipEvent(ctx context.Context, mutation *command.Mutation, operation command.Operation, user command.UserID, before *dbgen.ProjectMembership, after dbgen.ProjectMembership) (*string, error) {
	fields := []activity.FieldChange{}
	prefix := "memberships." + user.String() + "."
	if before == nil {
		role := after.Role
		removed := "false"
		fields = append(fields, activity.FieldChange{Field: prefix + "role", After: &role}, activity.FieldChange{Field: prefix + "removed", After: &removed})
	} else {
		changed(&fields, prefix+"role", before.Role, after.Role)
		changed(&fields, prefix+"removed", strconv.FormatBool(before.RemovedAt.Valid), strconv.FormatBool(after.RemovedAt.Valid))
	}
	cleared, err := mutation.Queries.IdentityClearIneligibleAssignments(ctx, dbgen.IdentityClearIneligibleAssignmentsParams{
		UserID:    user.UUID,
		ProjectID: &after.ProjectID,
	})
	if err != nil {
		return nil, err
	}
	for _, issue := range cleared {
		value := user.String()
		fields = append(fields, activity.FieldChange{Field: "issues." + issue.ID.String() + ".assigneeId", Before: &value})
	}
	project := command.ProjectID{UUID: after.ProjectID}
	event, err := activity.Append(ctx, mutation, activity.Draft{
		Action:       operation,
		ResourceKind: activity.ProjectResource,
		ResourceID:   after.ProjectID,
		ProjectID:    &project,
		Changes:      fields,
	})
	if err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func (service *Service) SetMembership(ctx context.Context, actor command.Actor, input SetMembershipInput) (command.SaveOutcome[MembershipView], error) {
	if input.ProjectID.UUID == uuid.Nil || input.UserID.UUID == uuid.Nil || input.ExpectedRevision < 0 || !input.Role.Valid() {
		return command.SaveOutcome[MembershipView]{}, validation("role", "A valid project, approved user, revision and role are required.")
	}
	canonical := setMembershipCommand{input.ProjectID, input.UserID, input.ExpectedRevision, input.Role}
	return command.Save(ctx, service.runner, membershipRequest(actor, command.SetMembership, input.ProjectID, input.RetryReference), canonical, func(ctx context.Context, mutation *command.Mutation) error {
		return authorizeUser(ctx, mutation, input.UserID)
	}, func(ctx context.Context, mutation *command.Mutation, input setMembershipCommand) (command.Change[MembershipView], error) {
		user, err := mutation.Queries.ReadUser(ctx, input.UserID.UUID)
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		current, err := mutation.Queries.ReadMembership(ctx, dbgen.ReadMembershipParams{
			ProjectID: input.ProjectID.UUID,
			UserID:    input.UserID.UUID,
		})
		var previous *dbgen.ProjectMembership
		if errors.Is(err, pgx.ErrNoRows) {
			if input.ExpectedRevision != 0 {
				return command.Change[MembershipView]{}, conflict(Current{})
			}
		} else if err != nil {
			return command.Change[MembershipView]{}, err
		} else {
			previous = &current
			view := membershipView(current, user)
			if command.InitialRevision(current.Revision) != input.ExpectedRevision {
				return command.Change[MembershipView]{}, conflict(Current{Membership: &view})
			}
			if current.Role == string(input.Role) && !current.RemovedAt.Valid {
				return command.Change[MembershipView]{Result: view, HTTPStatus: 200}, nil
			}
		}
		row, err := mutation.Queries.IdentitySetMembership(ctx, dbgen.IdentitySetMembershipParams{
			ProjectID: input.ProjectID.UUID,
			UserID:    input.UserID.UUID,
			Role:      string(input.Role),
		})
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		event, err := saveMembershipEvent(ctx, mutation, command.SetMembership, input.UserID, previous, row)
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		return command.Change[MembershipView]{Result: membershipView(row, user), EventID: event, HTTPStatus: 200}, nil
	}, validateMembership)
}
func (service *Service) RemoveMembership(ctx context.Context, actor command.Actor, input RemoveMembershipInput) (command.SaveOutcome[MembershipView], error) {
	if input.ProjectID.UUID == uuid.Nil || input.UserID.UUID == uuid.Nil || input.ExpectedRevision < 1 {
		return command.SaveOutcome[MembershipView]{}, validation("expectedRevision", "A valid current membership and revision are required.")
	}
	canonical := removeMembershipCommand{input.ProjectID, input.UserID, input.ExpectedRevision}
	return command.Save(ctx, service.runner, membershipRequest(actor, command.RemoveMembership, input.ProjectID, input.RetryReference), canonical, func(ctx context.Context, mutation *command.Mutation) error {
		return authorizeUser(ctx, mutation, input.UserID)
	}, func(ctx context.Context, mutation *command.Mutation, input removeMembershipCommand) (command.Change[MembershipView], error) {
		user, err := mutation.Queries.ReadUser(ctx, input.UserID.UUID)
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		current, err := mutation.Queries.ReadMembership(ctx, dbgen.ReadMembershipParams{
			ProjectID: input.ProjectID.UUID,
			UserID:    input.UserID.UUID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return command.Change[MembershipView]{}, unavailable()
		}
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		view := membershipView(current, user)
		if view.Revision != input.ExpectedRevision {
			return command.Change[MembershipView]{}, conflict(Current{Membership: &view})
		}
		if current.RemovedAt.Valid {
			return command.Change[MembershipView]{Result: view, HTTPStatus: 200}, nil
		}
		row, err := mutation.Queries.IdentityRemoveMembership(ctx, dbgen.IdentityRemoveMembershipParams{
			ProjectID: input.ProjectID.UUID,
			UserID:    input.UserID.UUID,
		})
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		event, err := saveMembershipEvent(ctx, mutation, command.RemoveMembership, input.UserID, &current, row)
		if err != nil {
			return command.Change[MembershipView]{}, err
		}
		return command.Change[MembershipView]{Result: membershipView(row, user), EventID: event, HTTPStatus: 200}, nil
	}, validateMembership)
}
