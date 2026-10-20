package main

import (
	"context"
	"errors"
	"flag"
	"net/mail"
	"strings"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

// OS/database-owner access is the authority for the first Administrator. This
// command is never a server route and cannot add another Admin after bootstrap.
func bootstrapOwner(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("bootstrap-owner", flag.ContinueOnError)
	email := flags.String("email", "", "approved owner email")
	name := flags.String("name", "", "owner display name")
	subject := flags.String("subject", "", "exact human provider subject")
	if err := flags.Parse(args); err != nil {
		return err
	}
	address, err := mail.ParseAddress(strings.TrimSpace(*email))
	if err != nil || address.Address != strings.TrimSpace(*email) || len(address.Address) > 320 || command.ValidateText(strings.TrimSpace(*name), 1, 100) != nil || *subject == "" || strings.HasSuffix(*subject, "@clients") {
		return errors.New("a valid owner email, name and human provider subject are required")
	}
	settings, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.Open(ctx, settings)
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	queries := dbgen.New(tx)
	if _, err := queries.CompanyExclusiveGuard(ctx); err != nil {
		return err
	}
	count, err := queries.IdentityActiveAdminCount(ctx)
	if err != nil {
		return err
	}
	if count != 0 {
		return errors.New("an active Administrator already exists; use authorized account administration")
	}
	user, err := queries.IdentityCreateUser(ctx, dbgen.IdentityCreateUserParams{
		ID:              uuid.New(),
		Email:           strings.ToLower(address.Address),
		EmailKey:        strings.ToLower(address.Address),
		DisplayName:     strings.TrimSpace(*name),
		IsAdministrator: true,
	})
	if err != nil {
		return err
	}
	if err := queries.IdentityBind(ctx, dbgen.IdentityBindParams{
		Issuer:  settings.Issuer,
		Subject: *subject,
		UserID:  user.ID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
