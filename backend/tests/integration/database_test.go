package integration

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/tests/testenv"
)

func TestBoundedPoolAndCancellation(t *testing.T) {
	fixture := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, fixture); err != nil {
		t.Fatal(err)
	}
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	// pgx preserves its original DSN even after the fixture changes Database.
	// Reopening that DSN would connect to the driver instead of this test.
	target := fixture.Config().ConnConfig.Database
	if !strings.HasPrefix(target, "gg_test_") {
		t.Fatal("runtime pool regression requires a disposable test database")
	}
	connection, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil || (connection.Scheme != "postgres" && connection.Scheme != "postgresql") {
		t.Fatal("runtime pool regression requires a PostgreSQL test URL")
	}
	connection.Path = "/" + target
	settings := config.Config{
		Environment:     config.Test,
		DatabaseURL:     connection.String(),
		CompanyLocation: location,
	}
	db, err := database.Open(ctx, settings)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var opened string
	if err := db.Pool.QueryRow(ctx, "SELECT current_database()").Scan(&opened); err != nil || opened != target {
		t.Fatal("runtime pool escaped the test database")
	}
	pool := db.Pool.Config()
	if pool.MaxConns != 10 || pool.MinConns != 0 || pool.MaxConnIdleTime != 5*time.Minute {
		t.Fatal("pool violates planned connection budget")
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if err := db.Pool.Ping(canceled); err == nil {
		t.Fatal("database ignored request cancellation")
	}
	settings.CompanyLocation = time.UTC
	if wrong, err := database.Open(ctx, settings); err == nil {
		wrong.Close()
		t.Fatal("persisted company time zone was ignored")
	}
}
