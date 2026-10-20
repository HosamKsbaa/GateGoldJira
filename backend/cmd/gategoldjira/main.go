package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/app"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "password-account" {
		if err := savePasswordAccount(os.Args[2:], os.Stdin); err != nil {
			slog.Error("password account provisioning failed", "reason", err.Error())
			os.Exit(1)
		}
		slog.Info("password account saved; company approval and project permissions still apply")
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		settings, err := config.LoadMigration()
		if err == nil {
			db, openErr := database.OpenForMigrations(ctx, settings)
			err = openErr
			if err == nil {
				defer db.Close()
				err = migrations.Apply(ctx, db.Pool)
			}
		}
		if err != nil {
			slog.Error("additive migration failed; schema-owner configuration and diagnostics are required")
			os.Exit(1)
		}
		slog.Info("additive migrations applied")
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "bootstrap-owner" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := bootstrapOwner(ctx, os.Args[2:]); err != nil {
			slog.Error("owner bootstrap failed")
			os.Exit(1)
		}
		slog.Info("initial owner bootstrap completed")
		return
	}
	if len(os.Args) > 1 && (os.Args[1] == "dev-init" || os.Args[1] == "dev-tokens") {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		var err error
		if os.Args[1] == "dev-init" {
			err = initializeFixtures(ctx)
		} else {
			err = localOnly()
			if err == nil {
				var keyErr error
				key, keyErr := localKeys()
				err = keyErr
				if err == nil {
					err = writeFixtureTokens(key)
				}
			}
		}
		if err != nil {
			slog.Error("local fixture command failed")
			os.Exit(1)
		}
		slog.Info("local password accounts and one-hour token files are ready; see the private local identity directory")
		return
	}
	settings, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "reason", err.Error())
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	application, err := app.New(startup, settings, slog.Default())
	cancel()
	if err != nil {
		slog.Error("application initialization failed", "reason", err.Error())
		os.Exit(1)
	}
	defer application.Close()
	application.StartBackground(ctx)
	server := &http.Server{
		Addr: ":" + strconv.Itoa(int(settings.Port)), Handler: application.Handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if settings.Environment != config.Production || settings.DeploymentTarget == config.VM {
		server.Addr = "127.0.0.1:" + strconv.Itoa(int(settings.Port))
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("server listening", "port", settings.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server stopped")
		os.Exit(1)
	}
}
