package identity

import (
	"context"
	"errors"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Service struct {
	runner   command.Runner
	cursors  *command.CursorSigner
	location *time.Location
	issuer   string
}

func New(runner command.Runner, cursors *command.CursorSigner, location *time.Location, issuer string) *Service {
	return &Service{runner, cursors, location, issuer}
}
func uniqueViolation(err error) bool {
	var databaseError *pgconn.PgError
	return errors.As(err, &databaseError) && databaseError.Code == "23505"
}
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
		Message:     "The record is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func normalizeUser(email, name string) (string, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	name = strings.TrimSpace(name)
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || len(email) > 320 {
		return "", "", validation("email", "Enter a valid email address.")
	}
	if command.ValidateText(name, 1, 100) != nil {
		return "", "", validation("displayName", "Display name must contain 1 to 100 characters.")
	}
	return email, name, nil
}
func viewUser(user dbgen.User) UserView {
	return UserView{
		ID:            command.UserID{UUID: user.ID},
		Email:         user.Email,
		DisplayName:   user.DisplayName,
		Approved:      user.ApprovedAt.Valid,
		Active:        !user.DisabledAt.Valid,
		Administrator: user.IsAdministrator,
		Revision:      command.Revision(user.Revision),
		CreatedAt:     user.CreatedAt.Time.UTC(),
		UpdatedAt:     user.UpdatedAt.Time.UTC(),
	}
}
func validateUser(user UserView) error {
	if user.ID.UUID == uuid.Nil || !user.Approved || user.Revision < 1 || user.CreatedAt.IsZero() || user.UpdatedAt.IsZero() {
		return errors.New("invalid user result")
	}
	_, _, err := normalizeUser(user.Email, user.DisplayName)
	return err
}
func authorizeUser(ctx context.Context, mutation *command.Mutation, id command.UserID) error {
	user, err := mutation.Queries.ReadUser(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && !user.ApprovedAt.Valid {
		return unavailable()
	}
	return err
}
func changed(fields *[]activity.FieldChange, name, before, after string) {
	if before != after {
		b, a := before, after
		*fields = append(*fields, activity.FieldChange{Field: name, Before: &b, After: &a})
	}
}
func (service *Service) GetMe(ctx context.Context, actor command.Actor) (Me, error) {
	return command.Read(ctx, service.runner, actor, command.Access{}, func(_ context.Context, mutation *command.Mutation) (Me, error) {
		return Me{
			UserID:          actor.UserID,
			Email:           mutation.User.Email,
			DisplayName:     mutation.User.DisplayName,
			Administrator:   mutation.User.IsAdministrator,
			CompanyTimeZone: service.location.String(),
		}, nil
	})
}

func (service *Service) ApproveUser(ctx context.Context, actor command.Actor, input ApproveInput) (command.SaveOutcome[UserView], error) {
	email, name, err := normalizeUser(input.Email, input.DisplayName)
	if err != nil {
		return command.SaveOutcome[UserView]{}, err
	}
	input.Email, input.DisplayName = email, name
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.ApproveUser,
		RetryReference: input.RetryReference,
		Access: command.Access{
			CompanyExclusive:  true,
			AdministratorOnly: true,
		},
	}
	canonical := ApproveFields{Email: input.Email, DisplayName: input.DisplayName, Administrator: input.Administrator}
	return command.Save(ctx, service.runner, request, canonical, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, mutation *command.Mutation, input ApproveFields) (command.Change[UserView], error) {
		user, err := mutation.Queries.IdentityCreateUser(ctx, dbgen.IdentityCreateUserParams{
			ID:              uuid.New(),
			Email:           input.Email,
			EmailKey:        input.Email,
			DisplayName:     input.DisplayName,
			IsAdministrator: input.Administrator,
		})
		if uniqueViolation(err) {
			return command.Change[UserView]{}, validation("email", "An approved account already uses this email.")
		}
		if err != nil {
			return command.Change[UserView]{}, err
		}
		fields := []activity.FieldChange{}
		for _, value := range []struct{ name, value string }{
			{"email", user.Email},
			{"displayName", user.DisplayName},
			{"active", "true"},
			{
				"administrator",
				strconv.FormatBool(user.IsAdministrator),
			},
		} {
			v := value.value
			fields = append(fields, activity.FieldChange{Field: value.name, After: &v})
		}
		event, err := activity.Append(ctx, mutation, activity.Draft{
			Action:       command.ApproveUser,
			ResourceKind: activity.UserResource,
			ResourceID:   user.ID,
			Changes:      fields,
		})
		if err != nil {
			return command.Change[UserView]{}, err
		}
		eventID := event.ID.String()
		return command.Change[UserView]{Result: viewUser(user), EventID: &eventID, HTTPStatus: 201}, nil
	}, validateUser)
}

func (service *Service) UpdateUser(ctx context.Context, actor command.Actor, input UpdateUserInput) (command.SaveOutcome[UserView], error) {
	email, name, err := normalizeUser(input.Email, input.DisplayName)
	if err != nil {
		return command.SaveOutcome[UserView]{}, err
	}
	input.Email, input.DisplayName = email, name
	if input.UserID.UUID == uuid.Nil || input.ExpectedRevision < 1 {
		return command.SaveOutcome[UserView]{}, validation("expectedRevision", "A current user and positive revision are required.")
	}
	request := command.MutationRequest{Actor: actor, Operation: command.UpdateUser, RetryReference: input.RetryReference, Access: command.Access{
		CompanyExclusive:  true,
		AdministratorOnly: true,
	}, ResolveProjects: func(ctx context.Context, mutation *command.Mutation) ([]command.ProjectScope, error) {
		ids, err := mutation.Queries.IdentityAssignedProjects(ctx, &input.UserID.UUID)
		if err != nil {
			return nil, err
		}
		scopes := []command.ProjectScope{}
		for _, id := range ids {
			scopes = append(scopes, command.ProjectScope{
				ProjectID:     command.ProjectID{UUID: id},
				Write:         true,
				AllowArchived: true,
			})
		}
		return scopes, nil
	}}
	canonical := updateCommand{
		UserID: input.UserID,
		UpdateUserFields: UpdateUserFields{
			ExpectedRevision: input.ExpectedRevision,
			Email:            input.Email,
			DisplayName:      input.DisplayName,
			Active:           input.Active,
			Administrator:    input.Administrator,
		},
	}
	return command.Save(ctx, service.runner, request, canonical, func(ctx context.Context, mutation *command.Mutation) error {
		return authorizeUser(ctx, mutation, input.UserID)
	}, func(ctx context.Context, mutation *command.Mutation, input updateCommand) (command.Change[UserView], error) {
		current, err := mutation.Queries.ReadUser(ctx, input.UserID.UUID)
		if err != nil {
			return command.Change[UserView]{}, err
		}
		view := viewUser(current)
		if view.Revision != input.ExpectedRevision {
			return command.Change[UserView]{}, conflict(Current{User: &view})
		}
		if current.IsAdministrator && !current.DisabledAt.Valid && (!input.Active || !input.Administrator) {
			count, err := mutation.Queries.IdentityActiveAdminCount(ctx)
			if err != nil {
				return command.Change[UserView]{}, err
			}
			if count <= 1 {
				return command.Change[UserView]{}, validation("administrator", "Keep at least one active Administrator.")
			}
		}
		fields := []activity.FieldChange{}
		changed(&fields, "email", current.Email, input.Email)
		changed(&fields, "displayName", current.DisplayName, input.DisplayName)
		changed(&fields, "active", strconv.FormatBool(view.Active), strconv.FormatBool(input.Active))
		changed(&fields, "administrator", strconv.FormatBool(current.IsAdministrator), strconv.FormatBool(input.Administrator))
		if len(fields) == 0 {
			return command.Change[UserView]{Result: view, HTTPStatus: 200}, nil
		}
		user, err := mutation.Queries.IdentityUpdateUser(ctx, dbgen.IdentityUpdateUserParams{
			ID:              input.UserID.UUID,
			Email:           input.Email,
			EmailKey:        input.Email,
			DisplayName:     input.DisplayName,
			Active:          input.Active,
			IsAdministrator: input.Administrator,
		})
		if uniqueViolation(err) {
			return command.Change[UserView]{}, validation("email", "An approved account already uses this email.")
		}
		if err != nil {
			return command.Change[UserView]{}, err
		}
		cleared, err := mutation.Queries.IdentityClearIneligibleAssignments(ctx, dbgen.IdentityClearIneligibleAssignmentsParams{UserID: input.UserID.UUID})
		if err != nil {
			return command.Change[UserView]{}, err
		}
		for _, issue := range cleared {
			before := input.UserID.String()
			fields = append(fields, activity.FieldChange{
				Field:  "issues." + issue.ProjectID.String() + "." + issue.ID.String() + ".assigneeId",
				Before: &before,
			})
		}
		event, err := activity.Append(ctx, mutation, activity.Draft{
			Action:       command.UpdateUser,
			ResourceKind: activity.UserResource,
			ResourceID:   user.ID,
			Changes:      fields,
		})
		if err != nil {
			return command.Change[UserView]{}, err
		}
		eventID := event.ID.String()
		return command.Change[UserView]{Result: viewUser(user), EventID: &eventID, HTTPStatus: 200}, nil
	}, validateUser)
}

type updateCommand struct {
	UserID command.UserID `json:"userId"`
	UpdateUserFields
}
