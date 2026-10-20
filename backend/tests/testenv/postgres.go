// Package testenv creates independent databases for integration test suites.
package testenv

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Database requires an explicit integration DSN. Unit tests never silently use
// a production database or mutate the developer's application database.
func Database(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		if os.Getenv("REQUIRE_POSTGRES_TESTS") == "1" {
			t.Fatal("TEST_DATABASE_URL is required for integration checks")
		}
		t.Skip("PostgreSQL integration test: set TEST_DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	name := "gg_test_" + uuid.New().String()[:8]
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+identifier); err != nil {
		_ = admin.Close(ctx)
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.Database = name
	config.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		cleanup, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, dropErr := admin.Exec(cleanup, "DROP DATABASE "+identifier+" WITH (FORCE)")
		closeErr := admin.Close(cleanup)
		if dropErr != nil {
			t.Error(dropErr)
		}
		if closeErr != nil {
			t.Error(closeErr)
		}
	})
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	return pool
}
