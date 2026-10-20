package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/jackc/pgx/v5"
)

func inactive() error {
	return &command.Failure{
		Code:        command.AccountInactive,
		Message:     "An active approved company account is required.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.ContactAdministrator,
	}
}

// Only an already approved email may bind once. Once bound, issuer/subject
// remain the authority even after an email edit; email never causes a rebind.
func (service *Service) Resolve(ctx context.Context, identity command.ProviderIdentity) (command.UserID, error) {
	ctx, cancel := command.OrdinaryContext(ctx)
	defer cancel()
	if identity.Issuer != service.issuer || identity.Subject == "" {
		return command.UserID{}, inactive()
	}
	if id, found, err := service.resolveExisting(ctx, identity); err != nil || found {
		return id, err
	}
	if identity.VerifiedEmail == nil {
		return command.UserID{}, inactive()
	}
	tx, err := service.runner.Pool.Begin(ctx)
	if err != nil {
		return command.UserID{}, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	queries := dbgen.New(tx)
	if _, err := queries.CompanyExclusiveGuard(ctx); err != nil {
		return command.UserID{}, err
	}
	user, err := queries.FindIdentity(ctx, dbgen.FindIdentityParams{Issuer: identity.Issuer, Subject: identity.Subject})
	if errors.Is(err, pgx.ErrNoRows) {
		if identity.VerifiedEmail == nil {
			return command.UserID{}, inactive()
		}
		user, err = queries.IdentityFindApprovedEmail(ctx, strings.ToLower(strings.TrimSpace(*identity.VerifiedEmail)))
		if errors.Is(err, pgx.ErrNoRows) {
			return command.UserID{}, inactive()
		}
		if err != nil {
			return command.UserID{}, err
		}
		if !user.ApprovedAt.Valid || user.DisabledAt.Valid {
			return command.UserID{}, inactive()
		}
		if err := queries.IdentityBind(ctx, dbgen.IdentityBindParams{
			Issuer:  identity.Issuer,
			Subject: identity.Subject,
			UserID:  user.ID,
		}); err != nil {
			if uniqueViolation(err) {
				return command.UserID{}, inactive()
			}
			return command.UserID{}, err
		}
	} else if err != nil {
		return command.UserID{}, err
	}
	if !user.ApprovedAt.Valid || user.DisabledAt.Valid {
		return command.UserID{}, inactive()
	}
	if err := tx.Commit(ctx); err != nil {
		return command.UserID{}, err
	}
	return command.UserID{UUID: user.ID}, nil
}

func (service *Service) resolveExisting(ctx context.Context, identity command.ProviderIdentity) (command.UserID, bool, error) {
	tx, err := service.runner.Pool.Begin(ctx)
	if err != nil {
		return command.UserID{}, false, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	queries := dbgen.New(tx)
	if _, err := queries.CompanySharedGuard(ctx); err != nil {
		return command.UserID{}, false, err
	}
	user, err := queries.FindIdentity(ctx, dbgen.FindIdentityParams{Issuer: identity.Issuer, Subject: identity.Subject})
	if errors.Is(err, pgx.ErrNoRows) {
		return command.UserID{}, false, nil
	}
	if err != nil {
		return command.UserID{}, false, err
	}
	if !user.ApprovedAt.Valid || user.DisabledAt.Valid {
		return command.UserID{}, true, inactive()
	}
	if err := tx.Commit(ctx); err != nil {
		return command.UserID{}, false, err
	}
	return command.UserID{UUID: user.ID}, true, nil
}
